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

const printItems = () => {
  console.log();

  const allItems = Object.values(allPRs);
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
      `  ${'%2s  %2s  %2s  %2s  %2s'}  ${'%s'.yellow}  [${'%s'.red}\n%44s[${'%-20s'.blue}      ${'%s'.magenta}\n`,
      (item.statuses.awaiting&&iconAW) || (item.statuses.created&&iconCR) || iconSPACE,
      (item.statuses.reviewed&&iconRV) || iconBLANK,
      (item.statuses.assigned&&iconAS) || iconBLANK,
      (item.statuses.requested&&iconRQ) || iconBLANK,
      (item.statuses.mentioned&&iconMN) || iconBLANK,
      item.updated_at,
      item.title,
      "",
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

const createdQ = `is:open is:pr author:${apiUser} archived:false`;
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
  addQueryToList(createdQ, "created"), 
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