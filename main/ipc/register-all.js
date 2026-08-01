const { registerFileOperations } = require('./handlers/file-operations');
const { registerNetwork } = require('./handlers/network');
const { registerUi } = require('./handlers/ui');
const { registerDocumentCreator } = require('./handlers/document-creator');

function registerAllIpc() {
  registerFileOperations();
  registerNetwork();
  registerUi();
  registerDocumentCreator();
}

module.exports = { registerAllIpc };