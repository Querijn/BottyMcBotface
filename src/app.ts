import Botty from "./Botty";

import ApiStatus from "./ApiStatus";
import ApiUrlInterpreter from "./ApiUrlInterpreter";
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
import { defaultBackedObject, fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

// Load and initialise settings
const sharedSettings = defaultBackedObject<SharedSettings>("settings/shared_settings.json", "private/shared_settings.json");
const commandList = fileBackedObject<CommandList>("settings/command_list.json");
const bot = new Botty(sharedSettings);

// Load extensions
const controller = new CommandController(bot.client, sharedSettings, "data/command_data.json");
const joinMessaging = new JoinMessaging(bot.client, sharedSettings, controller);
const logger = new Logger(bot.client, sharedSettings);
const keyFinder = new KeyFinder(bot.client, sharedSettings, "data/riot_keys.json");
const forum = new ForumReader(bot.client, sharedSettings, "data/forum_data.json", keyFinder);
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");
const apiUrlInterpreter = new ApiUrlInterpreter(bot.client, sharedSettings);

// register commands
controller.registerCommand(commandList.controller.toggle, controller.onToggle.bind(controller));
controller.registerCommand(commandList.controller.help, controller.onHelp.bind(controller));

controller.registerCommand(commandList.apiUrlInterpreter.updateSchema, apiUrlInterpreter.onUpdateSchemaRequest.bind(apiUrlInterpreter));
controller.registerCommand(commandList.keyFinder, keyFinder.onKeyList.bind(keyFinder));

const versionChecker = new VersionChecker(bot.client, sharedSettings, "data/version_data.json");
controller.registerCommand(commandList.welcome, joinMessaging.onWelcome.bind(joinMessaging));

const notes = new Info(sharedSettings, "data/info_data.json", versionChecker);
controller.registerCommand(commandList.info.note, notes.onNote.bind(notes));
controller.registerCommand(commandList.info.all, notes.onAll.bind(notes));

const officeHours = new OfficeHours(bot.client, sharedSettings, "data/office_hours_data.json");
controller.registerCommand(commandList.officeHours.ask, officeHours.onAsk.bind(officeHours));
controller.registerCommand(commandList.officeHours.ask_for, officeHours.onAskFor.bind(officeHours));
controller.registerCommand(commandList.officeHours.open, officeHours.onOpen.bind(officeHours));
controller.registerCommand(commandList.officeHours.close, officeHours.onClose.bind(officeHours));
controller.registerCommand(commandList.officeHours.question_remove, officeHours.onQuestionRemove.bind(officeHours));
controller.registerCommand(commandList.officeHours.question_list, officeHours.onQuestionList.bind(officeHours));

const react = new AutoReact(bot.client, sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json");
controller.registerCommand(commandList.autoReact.toggle_default_thinking, react.onToggleDefault.bind(react));
controller.registerCommand(commandList.autoReact.refresh_thinking, react.onRefreshThinking.bind(react));
controller.registerCommand(commandList.autoReact.toggle_react, react.onToggleReact.bind(react));

const uptime = new Uptime(sharedSettings, "data/uptime_data.json");
controller.registerCommand(commandList.uptime, uptime.onUptime.bind(uptime));

const status = new ApiStatus(sharedSettings);
controller.registerCommand(commandList.apiStatus, status.onStatus.bind(status));

const libraries = new RiotAPILibraries(sharedSettings);
controller.registerCommand(commandList.riotApiLibraries, libraries.onLibs.bind(libraries));

// start bot
bot.start().catch((reason) => {
    console.error(`Unable to run botty: ${reason}.`);
});
