import * as AWS from "aws-sdk";
import { SharedIniFileCredentials, Credentials, ECR } from "aws-sdk";

class AwsHelper {
  private credentials: Credentials;
  private ecr: ECR;

  get version() {
    return (AWS as any).VERSION;
  }

  async init(env: {
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SESSION_TOKEN?: string;
    AWS_PROFILE?: string;
    AWS_REGION: string;
  }) {
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
    this.ecr = new ECR({
      credentials: this.credentials,
      region: env.AWS_REGION,
    });
  }

  async ecrImageExists(options: {
    repositoryName: string;
    imageIds: ECR.ImageIdentifierList;
  }) {
    try {
      const images = await this.ecr
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

  async ecrGetLoginPassword() {
    return (await this.ecr.getAuthorizationToken().promise()).authorizationData;
  }
}

export default new AwsHelper();
