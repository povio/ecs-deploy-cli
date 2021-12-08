// #!/bin/bash
//
// # Deploy tooling
// ## Version: 1.1
//
//
//
// log () {
//   LOG_TYPE=${1}
//   LOG_MESSAGE=${2}
//
//   case $LOG_TYPE in
//     confirm)
//       # confirm if CLI
//       if [ -z "$CI" ]; then
//         read -r -p "${c_g}${LOG_MESSAGE}${c_x}"
//       fi
//       echo "${c_g}INFO: ${3}${c_x}";
//       ;;
//     *)
//       # anything else
//       echo "${LOG_TYPE}: ${LOG_MESSAGE}";
//       ;;
//   esac
// }
//
//
// load_aws_credentials () {
//   env_or_prompt "AWS_ACCOUNT_ID" AWS_ACCOUNT_ID
//
//   if [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_ACCESS_KEY_ID" ]; then
//     env_or_prompt "AWS_PROFILE" AWS_PROFILE
//   else
//     echo "${c_y}AWS_PROFILE:         SKIPPED (key/secret from env) ${c_y}";
//     export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
//     export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
//   fi
//
//   env_or_prompt "AWS_REGION" AWS_REGION
// }
//

//
// # Release
// load_release () {
//   if [ -z "$RELEASE" ]; then
//     RELEASE="$(git rev-parse HEAD)"
//   fi
//   env_or_prompt "RELEASE" RELEASE
// }
//
