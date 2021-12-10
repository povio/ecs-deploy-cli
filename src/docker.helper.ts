import { dockerCommand } from "docker-cli-js";
import cli from "./cli.helper";

const options = {
  echo: false,
};

class Docker {
  public enabled: boolean;
  public _version: string;

  get version() {
    return this._version;
  }

  async init() {
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
      return "n/a";
    }
    return this._version;
  }

  async imageExists(imageName: string): Promise<boolean> {
    const images = await dockerCommand(`images ${imageName}`, { echo: false });
    return "images" in images && images.images.length > 0;
  }

  async imageBuild(imageName: string, release: string, dockerFile: string) {
    await dockerCommand(
      `build --progress plain -t "${imageName}" -f "${dockerFile}" . --build-arg RELEASE="${release}"`,
      { echo: true }
    );
  }

  async login(server: string, username: string, password: string) {
    const response = await dockerCommand(
      `-l "debug" login --username ${username} --password-stdin ${server}`,
      { echo: false, stdin: password }
    );
    return response.login && response.login === "Login Succeeded";
  }
  async logout(server: string) {
    await dockerCommand(`logout ${server}`, { echo: false });
  }
}

export default new Docker();
