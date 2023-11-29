import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

export function getCredentials(options: { region: string }) {
  return fromNodeProviderChain({
    //...any input of fromEnv(), fromSSO(), fromTokenFile(), fromIni(),
    // fromProcess(), fromInstanceMetadata(), fromContainerMetadata()
    // Optional. Custom STS client configurations overriding the default ones.
    clientConfig: { region: options.region },
  });
}

export async function getAwsIdentity(options: { region: string }) {
  const stsClient = new STSClient({
    credentials: getCredentials(options),
    region: options.region,
  });
  return await stsClient.send(new GetCallerIdentityCommand({}));
}
