# Ghlist

A script to find your assigned and created open PRs

## Install

### Clone the repo

```cli
$ cd path/to/install
$ git clone https://github.com/rbeitra/ghlist.git
```

### Set up a GitHub API access token (so the script can query the GitHub API)
1. Go to GitHub Settings > Developer settings > [Personal access tokens](https://github.com/settings/tokens)
2. Click [Generate new token](https://github.com/settings/tokens/new) (You will be asked to confirm your password)
3. Copy the generated token
4. Add the required environment variables:
    - `GHLIST_GITHUB_API_TOKEN`: Your generated token
    - `GHLIST_GITHUB_API_USER`: Your GitHub username

E.g. add these lines to ~/.bashrc:

```cli
  export GHLIST_GITHUB_API_TOKEN=your_generated_token
  export GHLIST_GITHUB_API_USER=your_github_username
```

### Install the package dependencies

```cli
$ cd path/to/install/ghlist
$ npm install
```

## Run

```cli
$ cd path/to/install/ghlist
$ ./index.js
```
