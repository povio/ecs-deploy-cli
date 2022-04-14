import { dockerCommand } from "docker-cli-js";
import cli from "~cli.helper";

const options = {
  echo: true,
  // pass DOCKER_ env into the command to set remote docker machines
  env: Object.entries(process.env)
    .filter((x) => x[0].startsWith("DOCKER_"))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>),
};

export async function version() {
  try {
    return (await dockerCommand("--version", options)).raw
      .replace(/"|\\n/, "")
      .trim();
  } catch (e) {
    if (process.env.VERBOSE) {
      cli.verbose((e as string).toString());
    }
    return undefined;
  }
}

export async function imageExists(imageName: string): Promise<boolean> {
  const images = await dockerCommand(`images ${imageName}`, {
    ...options,
    echo: false,
  });
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(images));
  }
  return "images" in images && images.images.length > 0;
}

export async function imageBuild(
  imageName: string,
  release: string,
  dockerFile: string,
  previousImageName?: string
) {
  await dockerCommand(
    `build --progress plain -t "${imageName}" -f "${dockerFile}" ${
      previousImageName ? `--cache-from ${previousImageName}` : ""
    } . --build-arg RELEASE="${release}"`,
    options
  );
}

export async function imagePush(imageName: string) {
  await dockerCommand(`push ${imageName}`, options);
}

export async function imagePull(imageName: string) {
  await dockerCommand(`pull ${imageName}`, options);
}

export async function login(
  server: string,
  username: string,
  password: string
) {
  const response = await dockerCommand(
    `-l "debug" login --username ${username} --password ${password} ${server}`,
    { ...options, echo: false }
  );
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(response));
  }
  return response.login && response.login === "Login Succeeded";
}

export async function logout(server: string) {
  await dockerCommand(`logout ${server}`, { ...options, echo: false });
}

export default {
  version,
  logout,
  login,
  imageBuild,
  imageExists,
  imagePush,
  imagePull,
  options,
};
