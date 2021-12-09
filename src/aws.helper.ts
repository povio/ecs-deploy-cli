import * as AWS from "aws-sdk";
import { SharedIniFileCredentials, Credentials, STS } from "aws-sdk";

class AwsHelper {
  private credentials: Credentials;
  private sts: STS;

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
}

export default new AwsHelper();
