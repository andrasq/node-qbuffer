var QBuffer = require('./index')

module.exports = {
    'should parse package.json': function(t) {
        require('./package.json')
        t.done();
    },
}
