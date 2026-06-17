import * as real from './tools.js'
import * as mock from './mock.js'
import { binaryAvailable } from './runner.js'

// Seleciona implementação real ou mock dos BINÁRIOS (nfo/par2/post).
// A indexação (upload pro provider) é tratada à parte, via providers/ (factory).
export function getExecutor(useMock) {
  if (useMock) {
    return {
      mock: true,
      generateNfo: mock.generateNfo,
      generatePar2: mock.generatePar2,
      postNyuu: mock.postNyuu,
      postNyuuInputs: mock.postNyuuInputs,
    }
  }
  return {
    mock: false,
    generateNfo: real.generateNfo,
    generatePar2: real.generatePar2,
    postNyuu: real.postNyuu,
    postNyuuInputs: real.postNyuuInputs,
  }
}

export { parsePercent } from './tools.js'
export { binaryAvailable }
export { getAlgorithm, listAlgorithms, algorithmIds, DEFAULT_ALGORITHM } from './algorithms/index.js'
