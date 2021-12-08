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
// env_or_prompt () {
//   if [[ -z "${!2}" ]]; then
//
//     # non-interactive
//     if [ -n "$CI" ]; then
//       # non-interactive
//       log error "Missing Environment: $1"
//       exit 1;
//     fi
//
//     printf "${c_g}%-20s${c_x} " "$1:"
//     if [ -n "$3" ]; then
//       printf "${c_y}$3${c_x} "
//     fi
//     read -r NEW
//     if [ -n "$NEW" ]; then
//       export "$2=${NEW}";
//     elif [ -n "$3" ]; then
//       export "$2=$3";
//     else
//       log error "Missing Environment: $1"
//       exit 1;
//     fi
//   else
//     printf "${c_g}%-20s %s${c_x}\n" "$1:" "${!2}"
//   fi
// }
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

//
// # Dockerfile
// load_dockerfile () {
//   if [ -z "$DOCKER_PATH" ]; then
//     DOCKER_PATH=$PWD
//     log var DOCKER_PATH "$DOCKER_PATH"
//   else
//     log noticevar DOCKER_PATH "$DOCKER_PATH"
//   fi
// }
//
