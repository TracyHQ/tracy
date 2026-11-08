// A stand serves its site from a folder on this machine, bind-mounted into the web container. A Docker engine on
// another machine (DOCKER_HOST or a context reached over ssh or tcp) mounts a folder of ITS disk at that path, finds
// none, and starts the image's empty CMS: the stand answers with the installer and nothing says why. So a stand runs
// only against a Docker engine on this machine.

/** The engine address the docker CLI uses: DOCKER_HOST when set, else the current context's endpoint. */
export function dockerEndpoint({ dockerHost, contextEndpoint }) {
  return dockerHost?.trim() || contextEndpoint?.trim() || 'unix:///var/run/docker.sock'
}

/** null when the engine runs on this machine (a unix socket or a Windows pipe), else why a stand cannot run. */
export function remoteEngineProblem(endpoint) {
  if (/^(unix|npipe):\/\//.test(endpoint)) return null
  return `the Docker engine is at ${endpoint}, not on this machine: a stand bind-mounts a folder of this machine, which that engine cannot see (it would serve an empty CMS installer). Run the stand where the engine runs, or switch to a local Docker context.`
}
