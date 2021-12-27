import * as AWS from "aws-sdk";
import { SharedIniFileCredentials, ECR } from "aws-sdk";

function getCredentials() {
  if (!!process.env.AWS_PROFILE) {
    return new SharedIniFileCredentials({
      profile: process.env.AWS_PROFILE,
    });
  } else {
    return new AWS.Credentials({
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    });
  }
}

function getEcrCredentials(options: { region: string }) {
  return new ECR({
    credentials: getCredentials(),
    region: options.region,
  });
}

export async function ecrImageExists(options: {
  region: string;
  repositoryName: string;
  imageIds: ECR.ImageIdentifierList;
}) {
  const ecr = getEcrCredentials({ region: options.region });
  try {
    const images = await ecr
      .describeImages({
        repositoryName: options.repositoryName,
        imageIds: options.imageIds,
      })
      .promise();
    console.log(JSON.stringify(images.imageDetails));
  } catch (e) {
    if (e.name === "ImageNotFoundException") {
      return false;
    }
    throw e;
  }
  return true;
}

export async function ecrGetDockerCredentials(options: { region: string }) {
  const ecr = getEcrCredentials({ region: options.region });
  const auth = (await ecr.getAuthorizationToken().promise())
    .authorizationData[0];
  let password;
  try {
    password = Buffer.from(auth.authorizationToken, "base64")
      .toString("ascii")
      .split(":")[1];
  } catch (e) {
    throw new Error("Could not decode authorizationData");
  }
  return {
    password,
    username: "AWS",
    endpoint: auth.proxyEndpoint,
  };
}
