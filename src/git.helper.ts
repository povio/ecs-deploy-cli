import simpleGit from "simple-git";

export async function getGitVersion(pwd: string) {
  try {
    const git = simpleGit(pwd);
    return (await git.raw("--version")).trim();
  } catch (e) {
    return undefined;
  }
}

export async function getIsPristine(pwd: string): Promise<boolean> {
  try {
    const git = simpleGit(pwd);
    const response: any = await git.raw("status", "--porcelain");
    console.log(response);
    return response.porcelain.trim() !== "";
  } catch (e) {
    return undefined;
  }
}

export async function getRelease(pwd: string): Promise<string> {
  try {
    const git = simpleGit(pwd);
    return await git.revparse("HEAD");
  } catch (e) {
    return undefined;
  }
}
