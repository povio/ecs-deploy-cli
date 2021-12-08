#!/bin/sh

yarn ncc build src/deploy.ts -o bin

echo '#!/usr/bin/env node\n' > ./bin/ecs-deploy-cli
cat ./bin/index.js >> ./bin/ecs-deploy-cli
chmod +x ./bin/ecs-deploy-cli
rm ./bin/index.js
