// #!/bin/bash
//
// # Deploy tooling
// ## Version: 1.1
//
// # Colors
// if [ -n "$CI" ] || [ -n "$NO_COLOR" ]; then
//   c_r=``
//   c_g=``
//   c_y=``
//   c_x=``
// else
//   c_r=`tput setaf 1` # red
//   c_g=`tput setaf 2` # green
//   c_y=`tput setaf 3` # yellow
//   c_x=`tput sgr0`
// fi
//
//
// log () {
//   LOG_TYPE=${1}
//   LOG_MESSAGE=${2}
//
//   case $LOG_TYPE in
//     error)
//       # something fatal
//       echo "${c_r}[ERROR] ${LOG_MESSAGE}${c_x}";
//       ;;
//     warning)
//       # something that needs to be fixed, but not fatal
//       echo "${c_y}[WARNING] ${LOG_MESSAGE}${c_x}";
//       ;;
//     info)
//       # something regular
//       echo "${c_g}[INFO] ${LOG_MESSAGE}${c_x}";
//       ;;
//     notice)
//       # something irregular
//       echo "${c_g}[NOTICE] ${LOG_MESSAGE}${c_x}";
//       ;;
//     banner)
//       # section banner
//       echo "${c_g}==== ${LOG_MESSAGE} ====${c_x}";
//       ;;
//     var)
//       # variable
//       printf "%-20s %s\n" "$LOG_MESSAGE:" "${3}"
//       ;;
//     noticevar)
//       # info variable
//       printf "${c_y}%-20s %s\n" "$LOG_MESSAGE:" "${3}${c_x}"
//       ;;
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
// # check for changes in git
// check_git_changes() {
//   WORK_DIR=$(pwd)
//   if [ -d "$WORK_DIR/.git" ]; then
//     if [[ $(git status --porcelain) ]]; then
//       if [ -z "$IGNORE_GIT_CHANGES" ]; then
//         log error "Detected changes in .git"
//         exit 1;
//       else
//         log warning "Detected changes in .git"
//       fi
//     fi
//   else
//     log warning ".git not found"
//   fi
// }
//
// # Release
// load_release () {
//   if [ -z "$RELEASE" ]; then
//     RELEASE="$(git rev-parse HEAD)"
//   fi
//   env_or_prompt "RELEASE" RELEASE
// }
//
// # pull the env variables from .env
// load_stage_env () {
//   WORK_DIR=$(pwd)
//
//   # make the STAGE loading optional
//   if [ "${1}" = false ]; then
//     if [ -z "$STAGE" ]; then
//       return
//     fi
//   fi
//
//   set -o allexport
//
//   env_or_prompt "STAGE" STAGE
//
//   if [ -f "$WORK_DIR/.env.$STAGE" ]; then
//     log info "Loading .env.$STAGE"
//     source "$WORK_DIR/.env.$STAGE"
//   else
//     log warning ".env.$STAGE does not exist"
//   fi
//
//   # load deploy time secrets
//   #  runtime secrets should be injected with SSM/Secrets, see load_secrets
//   if [ -f "$WORK_DIR/.env.$STAGE.secrets" ]; then
//     if [ -z "$CI" ] ; then
//       log info "Loading .env.$STAGE.secrets"
//       source "$WORK_DIR/.env.$STAGE.secrets"
//     else
//       # secrets should not be loaded from CI
//       log warning "Did not load .env.$STAGE.secrets"
//     fi
//   fi
//
//   # load in a target of the stage
//   #  make sure you dont override
//   #  example use is for deploying multiple tasks
//   if [ -n "$SERVICE" ]; then
//     if [ -f "$WORK_DIR/.env.$STAGE.$SERVICE" ]; then
//       log var SERVICE "$SERVICE"
//       log info "Loading .env.$STAGE.$SERVICE"
//       source "$WORK_DIR/.env.$STAGE.$SERVICE"
//     else
//       log warning ".env.$STAGE.$SERVICE does not exist"
//     fi
//   fi
//
//   set +o allexport
//
// }
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
