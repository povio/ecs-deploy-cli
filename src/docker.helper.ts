import { dockerCommand } from "docker-cli-js";
import cli from "./cli.helper";

const options = {
  echo: false,
};

export async function version() {
  try {
    this._version = (await dockerCommand("--version", options)).raw
      .replace(/"|\\n/, "")
      .trim();
    this.enabled = true;
  } catch (e) {
    if (process.env.VERBOSE) {
      cli.error(e.toString());
    }
    this.enabled = false;
    return undefined;
  }
  return this._version;
}

export async function imageExists(imageName: string): Promise<boolean> {
  const images = await dockerCommand(`images ${imageName}`, { echo: false });
  if (process.env.VERBOSE) {
    cli.info(JSON.stringify(images));
  }
  return "images" in images && images.images.length > 0;
}

export async function imageBuild(
  imageName: string,
  release: string,
  dockerFile: string
) {
  await dockerCommand(
    `build --progress plain -t "${imageName}" -f "${dockerFile}" . --build-arg RELEASE="${release}"`,
    { echo: true }
  );
}

export async function imagePush(imageName: string) {
  await dockerCommand(`push ${imageName}`, { echo: true });
}

export async function login(
  server: string,
  username: string,
  password: string
) {
  const response = await dockerCommand(
    `-l "debug" login --username ${username} --password ${password} ${server}`,
    { echo: false }
  );
  if (process.env.VERBOSE) {
    cli.info(JSON.stringify(response));
  }
  return response.login && response.login === "Login Succeeded";
}

export async function logout(server: string) {
  await dockerCommand(`logout ${server}`, { echo: false });
}

export default {
  version,
  logout,
  login,
  imageBuild,
  imageExists,
  imagePush,
};
