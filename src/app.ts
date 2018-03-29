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
// const forum = new ForumReader(bot.client, sharedSettings, personalSettings, "data/forum_data.json", keyFinder);
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");
const controller = new CommandController(bot.client, sharedSettings);

// register commands
controller.registerCommand(commandList.controller.toggle, controller.onToggle);
controller.registerCommand(commandList.controller.help, controller.onHelp);

const notes = new Info(sharedSettings, "data/info_data.json", versionChecker);
controller.registerCommand(commandList.info.note, notes.onNote);
controller.registerCommand(commandList.info.all, notes.onAll);

const officeHours = new OfficeHours(bot.client, sharedSettings, "data/office_hours_data.json");
controller.registerCommand(commandList.officeHours.ask, officeHours.onAsk);
controller.registerCommand(commandList.officeHours.ask_for, officeHours.onAskFor);
controller.registerCommand(commandList.officeHours.open, officeHours.onOpen);
controller.registerCommand(commandList.officeHours.close, officeHours.onClose);
controller.registerCommand(commandList.officeHours.question_remove, officeHours.onQuestionRemove);
controller.registerCommand(commandList.officeHours.question_list, officeHours.onQuestionList);

const react = new AutoReact(bot.client, sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json");
controller.registerCommand(commandList.autoReact.toggle_default_thinking, react.onToggleDefault);
controller.registerCommand(commandList.autoReact.refresh_thinking, react.onRefreshThinking);
controller.registerCommand(commandList.autoReact.toggle_react, react.onToggleReact);

const uptime = new Uptime(sharedSettings, personalSettings, "data/uptime_data.json");
controller.registerCommand(commandList.uptime, uptime.onUptime);

const status = new ApiStatus(sharedSettings);
controller.registerCommand(commandList.apiStatus, status.onStatus);

const libraries = new RiotAPILibraries(personalSettings, sharedSettings);
controller.registerCommand(commandList.riotApiLibraries, libraries.onLibs);

// start bot
bot.start();
