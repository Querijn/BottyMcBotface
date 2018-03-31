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
import { EventController } from "./EventController";
import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

// Load and initialise settings
const sharedSettings = fileBackedObject<SharedSettings>("settings/shared_settings.json");
const personalSettings = fileBackedObject<PersonalSettings>("settings/personal_settings.json");
const commandList = fileBackedObject<CommandList>("settings/command_list.json");
const bot = new Botty(personalSettings, sharedSettings);

// Load extensions
const controller = new CommandController(sharedSettings, "data/command_data.json");
const joinMessaging = new JoinMessaging(sharedSettings, controller);
const logger = new Logger(sharedSettings);
const keyFinder = new KeyFinder(sharedSettings, "data/riot_keys.json");
const forum = new ForumReader(sharedSettings, personalSettings, "data/forum_data.json", keyFinder);
const techblog = new Techblog(sharedSettings, "data/techblog_data.json");
const versionChecker = new VersionChecker(sharedSettings, "data/version_data.json");
const notes = new Info(sharedSettings, "data/info_data.json", versionChecker);
const officeHours = new OfficeHours(sharedSettings, "data/office_hours_data.json");
const react = new AutoReact(sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json");
const uptime = new Uptime(sharedSettings, personalSettings, "data/uptime_data.json");
const status = new ApiStatus(sharedSettings);
const libraries = new RiotAPILibraries(personalSettings, sharedSettings);

// register events
const eventHandler = new EventController(bot.client);
eventHandler.registerHandler("ready", bot.onReady.bind(bot));
eventHandler.registerHandler("guildMemberAdd", bot.onGuildMemberAdd.bind(bot));
eventHandler.registerHandler("guildMemberRemove", bot.onGuildMemberRemove.bind(bot));
eventHandler.registerHandler("guildMemberUpdate", bot.onGuildMemberUpdate.bind(bot));

eventHandler.registerHandler("message", controller.onMessage.bind(controller));

eventHandler.registerHandler("ready", react.onReady.bind(react));
eventHandler.registerHandler("message", react.onMessage.bind(react));
eventHandler.registerHandler("message", react.onGreeting.bind(react));

eventHandler.registerHandler("ready", joinMessaging.onReady.bind(joinMessaging));
eventHandler.registerHandler("guildMemberAdd", joinMessaging.onGuildMemberAdd.bind(joinMessaging));

eventHandler.registerHandler("ready", keyFinder.onReady.bind(keyFinder));
eventHandler.registerHandler("message", keyFinder.onMessage.bind(keyFinder));

eventHandler.registerHandler("ready", logger.onReady.bind(logger));

eventHandler.registerHandler("ready", officeHours.onReady.bind(officeHours));

eventHandler.registerHandler("ready", techblog.onReady.bind(techblog));

eventHandler.registerHandler("ready", versionChecker.onReady.bind(versionChecker));

// register commands
controller.registerCommand(commandList.controller.toggle, controller.onToggle.bind(controller));
controller.registerCommand(commandList.controller.help, controller.onHelp.bind(controller));

controller.registerCommand(commandList.welcome, joinMessaging.onWelcome.bind(joinMessaging));

controller.registerCommand(commandList.info.note, notes.onNote.bind(notes));
controller.registerCommand(commandList.info.all, notes.onAll.bind(notes));

controller.registerCommand(commandList.officeHours.ask, officeHours.onAsk.bind(officeHours));
controller.registerCommand(commandList.officeHours.ask_for, officeHours.onAskFor.bind(officeHours));
controller.registerCommand(commandList.officeHours.open, officeHours.onOpen.bind(officeHours));
controller.registerCommand(commandList.officeHours.close, officeHours.onClose.bind(officeHours));
controller.registerCommand(commandList.officeHours.question_remove, officeHours.onQuestionRemove.bind(officeHours));
controller.registerCommand(commandList.officeHours.question_list, officeHours.onQuestionList.bind(officeHours));

controller.registerCommand(commandList.autoReact.toggle_default_thinking, react.onToggleDefault.bind(react));
controller.registerCommand(commandList.autoReact.refresh_thinking, react.onRefreshThinking.bind(react));
controller.registerCommand(commandList.autoReact.toggle_react, react.onToggleReact.bind(react));

controller.registerCommand(commandList.uptime, uptime.onUptime.bind(uptime));

controller.registerCommand(commandList.apiStatus, status.onStatus.bind(status));

controller.registerCommand(commandList.riotApiLibraries, libraries.onLibs.bind(libraries));

// start bot
bot.start();
