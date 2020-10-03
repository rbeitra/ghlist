#!/usr/bin/env node

const octokit = require('@octokit/rest')();
const colors = require('colors');
const sprintf = require('sprintf-js').sprintf;
const Spinner = require('cli-spinner').Spinner;
const yargs = require('yargs');

const argv = yargs
  .env('GHLIST')
  .usage('Usage: $0 [options]')

  .option('t', {
    alias: 'githubApiToken',
    nargs: 1,
    describe: 'GitHub API token',
    type: 'string'
  })

  .option('u', {
    alias: 'githubApiUser',
    nargs:  1,
    describe: 'GitHub username',
    type: 'string',
  })
  .example('$0 -u your_user_name', 'list open prs assigned to user')

  .option('r', {
    alias: 'repository',
    describe: 'GitHub repository names',
    nargs: 1,
    type: 'string',
  })
  .example('$0 -r ann/xyz -r bob/abc', 'list open prs from multiple repositories')

  .option('o', {
    alias: 'organization',
    describe: 'GitHub organization',
    nargs: 1,
    type: 'string'
  })
  .example('$0 -o some_org_name', 'list open prs on all repositories for some organization/user')

  .option('i', {
    alias: 'ignore-teams',
    describe: 'When searching by user, ignore requests implied by team memberships',
    nargs: 1,
    type: 'boolean',
    default: true
  })
  .example('$0 -s false', 'include requests implied by teams')

  .option('c', {
    alias: 'color',
    describe: 'Enable colors',
    nargs: 1,
    type: 'boolean',
    default: true
  })
  .example('$0 -c false', 'disable color output')

  .help('h')
  .alias('h', 'help')

  .epilog('Happy reviewing!')
  .argv;

const apiToken = argv.t;
const searchOrganization = argv.o;
const searchRepositories = argv.r && !Array.isArray(argv.r) ? [argv.r] : argv.r; //ensure either array or undefined
const searchUser = argv.u;
const noUserMode = !!(searchOrganization || searchRepositories);
const ignoreTeams = !noUserMode && argv.i;
const enableColor = argv.c;
if (!enableColor) {
  colors.disable();
}

octokit.authenticate({
  type: 'token',
  token: apiToken
});

const allPRs = {};

const getReviewRequested = (itemId, orgName, repoName, prNum) => {
  return new Promise((resolve, reject) => {
    octokit.pullRequests.getReviewRequests({
      owner: orgName, repo: repoName, number: prNum, per_page: 1, page: 1
    }).then((res) => {
      if (res && res.data && res.data.users && res.data.teams) {
        if (ignoreTeams) {
          const hasUser = res.data.users.find((u) => u.login === searchUser);
          if (hasUser) {
            allPRs[itemId].statuses["requested"] = true;
          }
        } else {
          const count = res.data.users.length + res.data.teams.length;
          if (count > 0) {
            allPRs[itemId].statuses["requested"] = true;
          }
        }
        resolve();
      } else {
        reject("no res");
      }
    });
  });
};

const getReviewed = (itemId, orgName, repoName, prNum) => {
  return new Promise((resolve, reject) => {
    octokit.pullRequests.getReviews({
      owner: orgName, repo: repoName, number: prNum, per_page: 1, page: 1
    }).then((res) => {
      resolve();
      if (res && res.data) {
        const count = res.data.length;
        if (count > 0) {
          allPRs[itemId].statuses["reviewed"] = true;
        }
        resolve();
      } else {
        reject("no res");
      }
    });
  });
};

const addQueryToList = (q, status) => {
  return new Promise((resolve, reject) => {
    octokit.search.issues({
      q: q
    }).then((res) => {
      if (res && res.data && res.data.items) {
        const furtherQueryPromises = [];
        //sometimes github returns closed items despite the "is:open" query
        const actuallyOpen = res.data.items.filter((item) => item.state === 'open');
        actuallyOpen.forEach((item) => {
          const prNum = item.number;
          const prRepoUrlParts = item.repository_url.split('/');
          const prRepoName = prRepoUrlParts[prRepoUrlParts.length-1];
          const prOrgName = prRepoUrlParts[prRepoUrlParts.length-2];

          if (!allPRs[item.id]) {
            allPRs[item.id] = item;
          }
          if (!allPRs[item.id].statuses) {
            allPRs[item.id].statuses = {};
          }

          if (noUserMode) {
            //get the assigned data from the item, and do additional requests for reviewed & review-requested status
            //since no user is specified, it doesn't really make sense to check for mentions
            const hasAssignee = item.assignees.length > 0;
            if (hasAssignee) {
              allPRs[item.id].statuses['assigned'] = true;
            }
            furtherQueryPromises.push(getReviewRequested(item.id, prOrgName, prRepoName, prNum));
            furtherQueryPromises.push(getReviewed(item.id, prOrgName, prRepoName, prNum));
          } else {
            if (status === 'requested') {
              furtherQueryPromises.push(getReviewRequested(item.id, prOrgName, prRepoName, prNum));
            } else {
              allPRs[item.id].statuses[status] = true;
            }
          }
        });
        Promise.all(furtherQueryPromises).then(resolve);
      } else {
        reject("no res");
      }
    }).catch(reject);
  });
};

const sortItems = (items) => {
  return items.sort((a, b) => {
    //put our created items at the bottom
    if (a.statuses.created !== b.statuses.created) {
      return a.statuses.created ? 1:-1;
    }
    //put items awaiting an initial review at the top
    if (a.statuses.awaiting !== b.statuses.awaiting) {
      return a.statuses.awaiting ? -1:1;
    }
    if (a.statuses.reviewed !== b.statuses.reviewed) {
      return a.statuses.reviewed ? -1:1;
    }
    if (a.statuses.requested !== b.statuses.requested) {
      return a.statuses.requested ? -1:1;
    }
    if (a.statuses.assigned !== b.statuses.assigned) {
      return a.statuses.assigned ? -1:1;
    }
    if (a.statuses.mentioned !== b.statuses.mentioned) {
      return a.statuses.mentioned ? -1:1;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}
const isRelevantForUser = (a) => {
  return a.statuses.created || a.statuses.reviewed || a.statuses.requested || a.statuses.assigned || a.statuses.mentioned;
}

const printItems = () => {
  console.log();

  let allItems = Object.values(allPRs);
  if (!noUserMode) {
    allItems = allItems.filter(isRelevantForUser);
  }
  // The special interest case: put unreviewed requested/assigned items at the top
  allItems.forEach((item)=>{
    item.statuses.awaiting = (item.statuses.assigned || item.statuses.requested) && !item.statuses.reviewed;
  });

  const iconAW = '=>'.red;
  const iconRV = 'RV'.green;
  const iconAS = 'AS'.green;
  const iconRQ = 'RQ'.green;
  const iconMN = 'MN'.green;
  const iconCR = '<='.green;
  const iconBLANK = '--'.grey;
  const iconSPACE = '  '.grey;
  const itemsSorted = sortItems(allItems);
  itemsSorted.forEach((item)=>{
    console.log(sprintf(
      `  ${'%2s  %2s  %2s  %2s  %2s'}  ${'%s'.yellow}  ${'[%-72.72s]'.red}  ${'%-16.16s'.blue}  ${'%s'.magenta}\n`,
      (item.statuses.awaiting&&iconAW) || (item.statuses.created&&iconCR) || iconSPACE,
      (item.statuses.reviewed&&iconRV) || iconBLANK,
      (item.statuses.assigned&&iconAS) || iconBLANK,
      (item.statuses.requested&&iconRQ) || iconBLANK,
      (item.statuses.mentioned&&iconMN) || iconBLANK,
      item.updated_at.replace(/[TZ]/g, ' '),
      item.title,
      item.user.login,
      item.html_url
    ));
  });
  const awaiting = itemsSorted.filter((item) => item.statuses.awaiting);
  const created = itemsSorted.filter((item) => item.statuses.created);
  console.log(`  ${(itemsSorted.length+'').magenta} open PRs`);
  console.log(`  ${(awaiting.length+'').red} awaiting review`);
  console.log(`  ${(created.length+'').green} created`);
  console.log();
  console.log(sprintf(
    '  (%2s:awaiting  %2s:reviewed   %2s:assigned   %2s:requested   %2s:mentioned  %2s:created)'
      .split('%2s').map((str)=>str.grey).join('%2s'),
      iconAW, iconRV, iconAS, iconRQ, iconMN, iconCR
  ));
  console.log();
};

const buildQueryPromises = () => {
  let queries = [];
  if (searchRepositories) {
    queries = searchRepositories.map((r) => {
      return {label: 'none', query: `is:open is:pr archived:false repo:${r}`};
    });
  } else if (searchOrganization) {
    queries = [
      {label: 'none', query: `is:open is:pr archived:false org:${searchOrganization}`}
    ];
  } else if (searchUser) {
    queries = [
      {label: 'created', query: `is:open is:pr archived:false author:${searchUser}`},
      {label: 'reviewed', query: `is:open is:pr archived:false reviewed-by:${searchUser}`},
      {label: 'requested', query: `is:open is:pr archived:false review-requested:${searchUser}`},
      {label: 'assigned', query: `is:open is:pr archived:false assignee:${searchUser}`},
      {label: 'mentioned', query: `is:open is:pr archived:false mentions:${searchUser}`},
    ];
  }
  return queries.map((q) => addQueryToList(q.query, q.label));
};

console.log();
const spinner = new Spinner(' Open PRs... %s');
spinner.setSpinnerString('|/-\\');
spinner.setSpinnerDelay(100);
spinner.start();

//do all queries concurrently. resolve when they are all completed
Promise.all(buildQueryPromises()).then(()=>{
  spinner.stop(true);
  console.log(` Open PRs...`);
  printItems();
}).catch((err)=>{
  console.log("error!", err);
});