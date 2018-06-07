#!/usr/bin/env node

const octokit = require('@octokit/rest')();
const colors = require('colors');
const sprintf = require('sprintf-js').sprintf;
const Spinner = require('cli-spinner').Spinner;

const apiToken = process.env.GHLIST_GITHUB_API_TOKEN;
const apiUser = process.env.GHLIST_GITHUB_API_USER;

octokit.authenticate({
  type: 'token',
  token: apiToken
});

const allPRs = {};

const addQueryToList = (q, status) => {
  return new Promise((resolve, reject) => {
    octokit.search.issues({
      q: q
    }).then((res) => {
      if (res && res.data && res.data.items) {
        res.data.items.forEach((item) => {
          if (!allPRs[item.id]) {
            allPRs[item.id] = item;
          } else {
          }
          if (!allPRs[item.id].statuses) {
            allPRs[item.id].statuses = {}
          }
          allPRs[item.id].statuses[status] = true;
        });
        resolve();
      } else {
        reject("no res");
      }
    }).catch(reject);
  });
};

const sortItems = (items) => {
  return items.sort((a, b) => {
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

const printItems = () => {
  console.log();

  const allItems = Object.values(allPRs);
  // The special interest case: put unreviewed requested/assigned items at the top
  allItems.forEach((item)=>{
    item.statuses.awaiting = (item.statuses.assigned || item.statuses.requested) && !item.statuses.reviewed;
  });

  const itemsSorted = sortItems(allItems);
  itemsSorted.forEach((item)=>{
    console.log(sprintf(
      `  ${'%2s  %2s  %2s  %2s  %2s'}  ${'%s'.yellow}  [${'%s'.red}]\n%44s[${'%-20s'.blue}      ${'%s'.magenta}]\n`,
      item.statuses.awaiting&&' *'.red||'  '.grey,
      item.statuses.reviewed&&'RV'.green||'--'.grey,
      item.statuses.assigned&&'AS'.green||'--'.grey,
      item.statuses.requested&&'RQ'.green||'--'.grey,
      item.statuses.mentioned&&'MN'.green||'--'.grey,
      item.updated_at,
      item.title,
      "",
      item.user.login,
      item.html_url
    ));
  });
  const awaitingReview = itemsSorted.filter((item) => item.statuses.awaiting);
  console.log(`  ${(itemsSorted.length+'').magenta} open PRs.`);
  console.log(`  ${(awaitingReview.length+'').red} awaiting review.`);
  console.log();
  console.log("  (*=awaiting  RV=reviewed   AS=assigned   RQ=requested   MN=mentioned)".green);
  console.log();
};

const reviewedQ = `is:open is:pr reviewed-by:${apiUser} archived:false`;
const requestedQ = `is:open is:pr review-requested:${apiUser} archived:false`;
const assignedQ = `is:open is:pr assignee:${apiUser} archived:false`;
const mentionedQ = `is:open is:pr mentions:${apiUser} archived:false`;

console.log();
const spinner = new Spinner(' Open PRs... %s');
spinner.setSpinnerString('|/-\\');
spinner.setSpinnerDelay(100);
spinner.start();

//do all queries concurrently. resolve when they are all completed
Promise.all([
  addQueryToList(reviewedQ, "reviewed"), 
  addQueryToList(requestedQ, "requested"),
  addQueryToList(assignedQ, "assigned"),
  addQueryToList(mentionedQ, "mentioned")
]).then(()=>{
  spinner.stop(true);
  console.log(` Open PRs...`);
  printItems();
}).catch((err)=>{
  console.log("error!", err);
});