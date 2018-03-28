import Botty from "./Botty";

import ApiStatus from "./ApiStatus";
import AutoReact from "./AutoReact";
import CommandController from "./CommandController";
import ForumReader from "./ForumReader";
import Info from "./Info";
import JoinMessaging from "./JoinMessaging";
import KeyFinder from "./KeyFinder";
import Logger from "./Logger";
import OfficeHours from "./OfficeHours";
import RiotAPILibraries from "./RiotAPILibraries";
import Techblog from "./Techblog";
import Uptime from "./Uptime";
import VersionChecker from "./VersionChecker";

import { CommandList } from "./CommandController";
import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

// Load and initialise settings
const sharedSettings = fileBackedObject<SharedSettings>("settings/shared_settings.json");
const personalSettings = fileBackedObject<PersonalSettings>("settings/personal_settings.json");
const commandList = fileBackedObject<CommandList>("settings/command_list.json");
const bot = new Botty(personalSettings, sharedSettings);

// Load extensions
const joinMessaging = new JoinMessaging(bot.client, sharedSettings);
const versionChecker = new VersionChecker(bot.client, sharedSettings, "data/version_data.json");
const logger = new Logger(bot.client, sharedSettings);
const keyFinder = new KeyFinder(bot.client, sharedSettings, "data/riot_keys.json");
const forum = new ForumReader(bot.client, sharedSettings, personalSettings, "data/forum_data.json", keyFinder);
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");

const controller = new CommandController(bot.client, sharedSettings);

// bot.registerCommand(commandList.channelAccess, new ChannelAccess(bot.client, sharedSettings));
controller.registerCommand(commandList.info, new Info(sharedSettings, "data/info_data.json", versionChecker));
controller.registerCommand(commandList.officeHours, new OfficeHours(sharedSettings, "data/office_hours_data.json"));
controller.registerCommand(commandList.autoReact, new AutoReact(sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json"));
controller.registerCommand(commandList.uptime, new Uptime(sharedSettings, personalSettings, "data/uptime_data.json"));
controller.registerCommand(commandList.apiStatus, new ApiStatus(sharedSettings));
controller.registerCommand(commandList.riotApiLibraries, new RiotAPILibraries(personalSettings, sharedSettings));

// start bot
bot.start();
