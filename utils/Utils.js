class Utils {
    static createId(length = 6, chars = "abcdefghijklmnopqrstuvwxyz1234567890") {
        let result = "";

        for (let i = 0; i < length; i++)
            result += chars[(Math.random() * chars.length) | 0];

        return result;
    }
}

module.exports = Utils;