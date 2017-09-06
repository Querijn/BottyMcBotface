import Botty from "./Botty";

import Uptime from "./Uptime";
import Thinking from "./Thinking";
import Honeypot from "./Honeypot";
import ForumReader from "./ForumReader";
import KeyFinder from "./KeyFinder";
import Techblog from "./Techblog";
import ChannelAccess from "./ChannelAccess";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";

// Load and initialise settings
const sharedSettings = fileBackedObject<SharedSettings>("settings/shared_settings.json");
const personalSettings = fileBackedObject<PersonalSettings>("settings/personal_settings.json");
const bot = new Botty(personalSettings);

// Load extensions
const uptime = new Uptime(bot.client, sharedSettings, personalSettings, "data/uptime_data.json");
const keyFinder = new KeyFinder(bot.client, sharedSettings, "data/riot_keys.json");
const forum = new ForumReader(bot.client, sharedSettings, personalSettings, "data/forum_data.json", keyFinder);
const thinking = new Thinking(bot.client, "data/thinking_data.json");
const honeypot = new Honeypot(bot.client, sharedSettings, personalSettings);
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");
const channelAccess = new ChannelAccess(bot.client, sharedSettings);

// start bot
bot.start();
