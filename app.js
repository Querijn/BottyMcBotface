const BotNamespace = require("./bot.js");

const UptimeNamespace = require("./uptime.js");
const ThinkingNamespace = require("./thinking.js");
const HoneypotNamespace = require("./honeypot.js");
const ForumNamespace = require("./forum.js");
const KeyfinderNamespace = require("./key_finder.js");

// Load and initialise settings
const t_Bot = new BotNamespace.Botty("settings/settings.json");

// Load extensions
const t_Uptime = new UptimeNamespace.Uptime(t_Bot.Client, "settings/uptime_settings.json", "data/uptime_data.json");
const t_KeyFinder = new KeyfinderNamespace.KeyFinder(t_Bot.Client, "settings/riot_keys_settings.json", "data/riot_keys.json");
const t_Forum = new ForumNamespace.ForumReader(t_Bot.Client, "settings/forum_settings.json", "data/forum_data.json", t_KeyFinder);
const t_Thinking = new ThinkingNamespace.Thinking(t_Bot.Client, "data/thinking_data.json");
const t_Honeypot = new HoneypotNamespace.Honeypot(t_Bot.Client, "settings/honeypot_settings.json");

// Start bot
t_Bot.Start();
