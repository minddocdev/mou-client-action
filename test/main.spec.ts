import { getInput, setFailed } from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

import { run } from '@minddocdev/mou-client-action/main';

jest.mock('@actions/core');
jest.mock('axios');
jest.mock('@actions/github');

describe('run', () => {
  // Required input values
  const args =
    'app: myApp\n' +
    'cluster: myCluster\n' +
    'domain: myDomain\n' +
    'environment: test';
  const host = 'http://localhost/api/mou';
  const token = 'secret';
  const sha = '734713bc047d87bf7eac9674765ae793478c50d3';
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  const mockInput = (mockCommand: string, mockArgs: string = args) => {
    (getInput as jest.Mock).mockImplementation((name: string) => {
      switch (name) {
        case 'command':
          return mockCommand;
        case 'args':
          return mockArgs;
        case 'host':
          return host;
        case 'token':
          return token;
        default:
          return undefined;
      }
    });
  };

  describe('deploy', () => {
    test('with branch context', async () => {
      mockInput('deploy');
      const axiosPostMock = jest.fn();
      const axiosCreateMock = jest.fn(() => ({
        post: axiosPostMock,
      }));

      (axios.create as jest.Mock).mockImplementation(axiosCreateMock);
      github.context.ref = 'refs/heads/mybranch';
      github.context.sha = sha;

      await run();

      expect(axiosCreateMock).toBeCalledWith({
        headers,
        baseURL: host,
      });
      expect(axiosPostMock).toBeCalledWith('/deployments', {
        app: 'myApp',
        branch: 'mybranch',
        cluster: 'myCluster',
        domain: 'myDomain',
        environment: 'test',
        sha,
      });
      expect(setFailed).not.toBeCalled();
    });

    test('with tag context', async () => {
      mockInput('deploy');
      const axiosPostMock = jest.fn();
      const axiosCreateMock = jest.fn(() => ({
        post: axiosPostMock,
      }));

      (axios.create as jest.Mock).mockImplementation(axiosCreateMock);
      github.context.ref = 'refs/tags/myapp@1.0.0-rc.1';
      github.context.sha = sha;

      await run();

      expect(axiosCreateMock).toBeCalledWith({
        headers,
        baseURL: host,
      });
      expect(axiosPostMock).toBeCalledWith('/deployments', {
        app: 'myApp',
        branch: 'master',
        cluster: 'myCluster',
        domain: 'myDomain',
        environment: 'test',
        tag: 'myapp@1.0.0-rc.1',
      });
      expect(setFailed).not.toBeCalled();
    });

    test('when sha and branch is given for a MINOR change', async () => {
      mockInput(
        'deploy',
        '{ "app": "myApp", "environment": "myEnv", "branch": "givenbranch", "sha": "givensha" }'
      );
      const axiosPostMock = jest.fn();
      const axiosCreateMock = jest.fn(() => ({
        post: axiosPostMock,
      }));

      (axios.create as jest.Mock).mockImplementation(axiosCreateMock);
      github.context.ref = 'refs/heads/otherbranch';
      github.context.sha = sha;
      github.context.payload = {
        commits: [
          { message: 'Normal commit' },
          { message: 'Bump #MINOR' },
        ],
      };

      await run();

      expect(axiosCreateMock).toBeCalledWith({
        headers,
        baseURL: host,
      });
      expect(axiosPostMock).toBeCalledWith('/deployments', {
        app: 'myApp',
        branch: 'givenbranch',
        changeType: 'minor',
        environment: 'myEnv',
        sha: 'givensha',
      });
      expect(setFailed).not.toBeCalled();
    });

    test('when tag is given for a MAJOR change', async () => {
      mockInput(
        'deploy',
        '{ "app": "myApp", "environment": "myEnv", "tag": "giventag" }',
      );
      const axiosPostMock = jest.fn();
      const axiosCreateMock = jest.fn(() => ({
        post: axiosPostMock,
      }));

      (axios.create as jest.Mock).mockImplementation(axiosCreateMock);
      github.context.ref = 'refs/tags/othertag';
      github.context.sha = sha;
      github.context.payload = {
        commits: [
          { message: 'Normal commit' },
          { message: 'Bump #MAJOR' },
          { message: 'Bump #MINOR' },
        ]
      };

      await run();

      expect(axiosCreateMock).toBeCalledWith({
        headers,
        baseURL: host,
      });
      expect(axiosPostMock).toBeCalledWith('/deployments', {
        app: 'myApp',
        branch: 'master',
        changeType: 'major',
        environment: 'myEnv',
        tag: 'giventag',
      });
      expect(setFailed).not.toBeCalled();
    });
  });

  test('undeploy', async () => {
    mockInput('undeploy');
    const axiosPostMock = jest.fn();
    const axiosCreateMock = jest.fn(() => ({
      post: axiosPostMock,
    }));

    (axios.create as jest.Mock).mockImplementation(axiosCreateMock);

    await run();

    expect(axiosCreateMock).toBeCalledWith({
      headers,
      baseURL: host,
    });
    expect(axiosPostMock).not.toBeCalled();
    expect(setFailed).not.toBeCalled();
  });

  test('invalid command', async () => {
    mockInput('wrong');
    await run();
    expect(setFailed).toBeCalledWith('Invalid command "wrong".');
  });

  test('invalid args', async () => {
    mockInput('deploy', '%@');
    await run();
    expect(setFailed).toBeCalledWith('Unable to parse args. Found content: "%@"');
  });

  test('no required values', async () => {
    mockInput('deploy', '{ "norequired": "nope" }');
    await run();
    expect(setFailed).toBeCalledWith(
      'Invalid arg value for mandatory key "app". Found "undefined" while expecting a string.',
    );
  });

  test('invalid optional values', async () => {
    mockInput('deploy', '{ "app": "myApp", "environment": "myEnv", "branch": 1 }');
    await run();
    expect(setFailed).toBeCalledWith(
      'Expecting string in "branch" optional arg. Found "1".',
    );
  });
});
