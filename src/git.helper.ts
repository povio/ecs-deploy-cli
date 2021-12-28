import simpleGit from "simple-git";

export async function getGitVersion(pwd: string) {
  try {
    const git = simpleGit(pwd);
    return (await git.raw("--version")).trim();
  } catch (e) {
    return undefined;
  }
}

export async function getGitChanges(pwd: string): Promise<string> {
  try {
    const git = simpleGit(pwd);
    return git.raw("status", "--porcelain");
  } catch (e) {
    console.log(e);
    return undefined;
  }
}

export async function getRelease(pwd: string): Promise<string> {
  try {
    const git = simpleGit(pwd);
    return await git.revparse("HEAD");
  } catch (e) {
    console.log(e);
    return undefined;
  }
}
