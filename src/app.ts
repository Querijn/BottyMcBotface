import Botty from "./Botty";

import Uptime from "./Uptime";
import AutoReact from "./AutoReact";
import Honeypot from "./Honeypot";
import ForumReader from "./ForumReader";
import KeyFinder from "./KeyFinder";
import Techblog from "./Techblog";
import ChannelAccess from "./ChannelAccess";
import VersionChecker from "./VersionChecker";
import Info from "./Info";
import JoinMessaging from "./JoinMessaging";
import Logger from "./Logger";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";
import ApiStatus from './ApiStatus';
import OfficeHours from "./OfficeHours";
import RiotAPILibraries from "./RiotAPILibraries";

// Load and initialise settings
const sharedSettings = fileBackedObject<SharedSettings>("settings/shared_settings.json");
const personalSettings = fileBackedObject<PersonalSettings>("settings/personal_settings.json");
const bot = new Botty(personalSettings, sharedSettings);

// Load extensions
//const honeypot = new Honeypot(bot.client, sharedSettings, personalSettings);

// TODO: add registerEvent for these?
const joinMessaging = new JoinMessaging(bot.client, sharedSettings);
const versionChecker = new VersionChecker(bot.client, sharedSettings, "data/version_data.json");
const logger = new Logger(bot.client, sharedSettings);
const keyFinder = new KeyFinder(bot.client, sharedSettings, "data/riot_keys.json");
const forum = new ForumReader(bot.client, sharedSettings, personalSettings, "data/forum_data.json", keyFinder);
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");

// info seems like a pain to fix because of the .note syntax, so imma just leave it like this for now
const info = new Info(bot.client, sharedSettings, "data/info_data.json", versionChecker);

//bot.registerCommand(sharedSettings.channelAccess.commands, new ChannelAccess(bot.client, sharedSettings));
bot.registerCommand(sharedSettings.officehours.commands, new OfficeHours(sharedSettings, "data/office_hours_data.json"))
bot.registerCommand(sharedSettings.autoReact.commands, new AutoReact(sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json"))
bot.registerCommand(sharedSettings.uptimeSettings.commands, new Uptime(sharedSettings, personalSettings, "data/uptime_data.json"))
bot.registerCommand(sharedSettings.apiStatus.commands, new ApiStatus(sharedSettings));
bot.registerCommand(sharedSettings.riotApiLibraries.commands, new RiotAPILibraries(personalSettings, sharedSettings));

// start bot
bot.start();
