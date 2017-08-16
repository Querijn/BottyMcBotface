// TODO reenable features in here
import Botty from "./Botty";

// import Uptime from "./Uptime";
// import Thinking from "./Thinking";
// import Honeypot from "./Honeypot";
import ForumReader from "./ForumReader";
import KeyFinder from "./KeyFinder";
import Techblog from "./Techblog";

// Load and initialise settings
const t_Bot = new Botty("settings/settings.json");

// Load extensions
// const t_Uptime = new Uptime(t_Bot.Client, "settings/uptime_settings.json", "data/uptime_data.json");
const t_KeyFinder = new KeyFinder(t_Bot.Client, "settings/riot_keys_settings.json", "data/riot_keys.json");
const t_Forum = new ForumReader(t_Bot.Client, "settings/forum_settings.json", "data/forum_data.json", t_KeyFinder);
// const t_Thinking = new Thinking(t_Bot.Client, "data/thinking_data.json");
// const t_Honeypot = new Honeypot(t_Bot.Client, "settings/honeypot_settings.json");
const t_Techblog = new Techblog(t_Bot.Client, "settings/techblog_settings.json", "data/techblog_data.json");

// Start bot
t_Bot.Start();
