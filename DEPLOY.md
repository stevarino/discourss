# Deployment Instructions

A build timestamp is encoded into src/version.ts when 
`npm run build` is run. This allows for log data to be correlated with
build labels, as the AppsScript API does not allow the running script
to query its current version.

Therefore, building, testing, and deploying can be complicated as a version
each build is different and must be coordinated with the npm versions.

To build use the `npm run build` command.

To deploy, use the `npm run patch`, `minor`, or `major` commands. These
will ensure the AppsScript HEAD is current, the NPM version is properly
incremented, and a deployed version is sent.
