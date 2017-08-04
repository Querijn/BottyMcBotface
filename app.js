var BotNamespace = require("./bot.js");

var UptimeNamespace = require("./uptime.js");
var ThinkingNamespace = require("./thinking.js");
var HoneypotNamespace = require("./honeypot.js");
var ForumNamespace = require("./forum.js");
var KeyfinderNamespace = require("./key_finder.js");

// Load and initialise settings
var t_Bot = new BotNamespace.Botty("settings/settings.json");

// Load extensions
var t_Uptime = new UptimeNamespace.Uptime(t_Bot.Client, "settings/uptime_settings.json", "data/uptime_data.json");
var t_KeyFinder = new KeyfinderNamespace.KeyFinder(t_Bot.Client, "settings/riot_keys_settings.json", "data/riot_keys.json");
var t_Forum = new ForumNamespace.ForumReader(t_Bot.Client, "settings/forum_settings.json", "data/forum_data.json", t_KeyFinder);
var t_Thinking = new ThinkingNamespace.Thinking(t_Bot.Client, "data/thinking_data.json");
var t_Honeypot = new HoneypotNamespace.Honeypot(t_Bot.Client, "settings/honeypot_settings.json");

// Start bot
t_Bot.Start();