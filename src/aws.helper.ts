import * as AWS from "aws-sdk";
import { SharedIniFileCredentials, Credentials, ECR } from "aws-sdk";

class AwsHelper {
  private credentials: Credentials;
  private ecr: ECR;

  get version() {
    return (AWS as any).VERSION;
  }

  async init(env: Record<string, any>) {
    if (!!env.AWS_PROFILE) {
      this.credentials = new SharedIniFileCredentials({
        profile: env.AWS_PROFILE,
      });
    } else {
      this.credentials = new AWS.Credentials({
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        sessionToken: env.AWS_SESSION_TOKEN || undefined,
      });
    }
  }

  async ecsImageExists(options: {
    region: string;
    repositoryName: string;
    imageIds: ECR.ImageIdentifierList;
  }) {
    const ecr = new ECR({
      credentials: this.credentials,
      region: options.region,
    });

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
}

export default new AwsHelper();
