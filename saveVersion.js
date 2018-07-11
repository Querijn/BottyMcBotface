var spawn = require("child_process").spawn;
var git = spawn("git" ["rev-parse", "HEAD"]);
git.stdout.on("data", (data) => require("fs").writeFile("version", data.toString());
