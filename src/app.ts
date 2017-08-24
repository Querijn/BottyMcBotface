import Botty from "./Botty";

import Uptime from "./Uptime";
import Thinking from "./Thinking";
import Honeypot from "./Honeypot";
import ForumReader from "./ForumReader";
import KeyFinder from "./KeyFinder";
import Techblog from "./Techblog";
import ChannelAccess from "./ChannelAccess";

// Load and initialise settings
const bot = new Botty("settings/settings.json");

// Load extensions
const uptime = new Uptime(bot.client, "settings/uptime_settings.json", "data/uptime_data.json");
const keyFinder = new KeyFinder(bot.client, "settings/riot_keys_settings.json", "data/riot_keys.json");
const forum = new ForumReader(bot.client, "settings/forum_settings.json", "data/forum_data.json", keyFinder);
const thinking = new Thinking(bot.client, "data/thinking_data.json");
const honeypot = new Honeypot(bot.client, "settings/honeypot_settings.json");
const techblog = new Techblog(bot.client, "settings/techblog_settings.json", "data/techblog_data.json");
const channelAccess = new ChannelAccess(bot.client, "settings/channel_access_settings.json");

// start bot
bot.start();
