import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';
import * as yaml from 'js-yaml';

type Command = 'deploy' | 'undeploy';

interface Args {
  app: string;
  environment: string;
  branch?: string;
  cluster?: string;
  domain?: string;
  tag?: string;
  sha?: string;
}

function getArgs(): Args {
  const rawArgs = core.getInput('args', { required: true });
  core.debug(`Parsing raw args '${rawArgs}'...`);
  let args: Args;
  try {
    // Try JSON first
    args = JSON.parse(rawArgs);
    core.debug(`Loaded args: ${rawArgs}`);
  } catch (jsonError) {
    // Try YAML format
    try {
      args = yaml.safeLoad(rawArgs);
    } catch (yamlError) {
      throw new Error(`Unable to parse args. Found content: "${rawArgs}"`);
    }
  }
  // Check loaded types
  ['app', 'environment'].forEach(requiredKey => {
    const requiredValue = args[requiredKey];
    if (!requiredValue || typeof requiredValue !== 'string') {
      throw new Error(
        `Invalid arg value for mandatory key "${requiredKey}". ` +
        `Found "${requiredValue}" while expecting a string.`);
    }
  });
  ['branch', 'cluster', 'domain', 'tag', 'sha'].forEach(optionalKey => {
    if (args[optionalKey] && typeof args[optionalKey] !== 'string') {
      throw new Error(
        `Expecting string in "${optionalKey}" optional arg. Found "${args[optionalKey]}".`);
    }
  });
  return args;
}

export async function run() {
  try {
    const command = core.getInput('command', { required: true });
    const args = getArgs();
    const host = core.getInput('host', { required: true });
    const token = core.getInput('token', { required: true });

    const { context: { ref, sha } } = github;
    const postArgs: Args = args;
    if (ref.startsWith('refs/tags/') && !postArgs.tag) {
      // Detect tag from context if no tag is provided
      postArgs.tag = ref.replace('refs/tags/', '');
      postArgs.branch = 'master';
    } else if (ref.startsWith('refs/heads/') && !postArgs.branch) {
      // Detect branch if no tag is detected and branch is not given
      postArgs.branch = ref.replace('refs/heads/', '');
    }
    // Load sha from context if no sha is provided or no tag is detected
    if (!postArgs.tag && !postArgs.sha) {
        postArgs.sha = sha;
    }
    // Default branch to master if it could not be detected
    if (!postArgs.branch) {
      postArgs.branch = 'master';
    }

    const mouClient = axios.create({
      baseURL: host,
      headers: {
        Authorization: token,
      },
    });

    switch (command) {
      case 'deploy':
        await mouClient.post('/deployment', postArgs);
        break;
      case 'undeploy':
        core.debug('Not implemented');
        break;
      default:
        throw new Error(`Invalid command "${command}".`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
