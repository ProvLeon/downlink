module.exports = {
  readVersion: function (contents) {
    const match = contents.match(/version\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  },
  writeVersion: function (contents, version) {
    return contents.replace(/(version\s*=\s*")([^"]+)(")/, `$1${version}$3`);
  }
};
