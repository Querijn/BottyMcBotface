import Botty from "./Botty";

import ApiStatus from "./ApiStatus";
import ApiUrlInterpreter from "./ApiUrlInterpreter";
import AutoReact from "./AutoReact";
import CommandController from "./CommandController";
import Info from "./Info";
import KeyFinder from "./KeyFinder";
import Logger from "./Logger";
import RiotAPILibraries from "./RiotAPILibraries";
import Techblog from "./Techblog";
import VersionChecker from "./VersionChecker";
import ESportsAPI from "./ESports";
import Endpoint from "./Endpoint";
import PageDiffer from "./PageDiffer";
import { APISchema } from "./ApiSchema";
import { CommandList } from "./CommandController";
import { overrideFileBackedObject, fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import SpamKiller from "./SpamKiller";
import Admin from "./Admin";
import GameData from "./GameData";
import InteractionManager from "./InteractionManager";

// Load and initialise settings
const sharedSettings = overrideFileBackedObject<SharedSettings>("settings/shared_settings.json", "private/shared_settings.json");
const commandList = fileBackedObject<CommandList>("settings/command_list.json", "www/data/command_list.json");
const bot = new Botty(sharedSettings);

// Load extensions
const interactionManager = new InteractionManager(bot, sharedSettings);
const controller = new CommandController(bot.client, sharedSettings, "data/command_data.json");
const apiSchema = new APISchema(sharedSettings);
const logger = new Logger(bot.client, sharedSettings);
const keyFinder = new KeyFinder(bot.client, sharedSettings, "data/riot_keys.json");
const techblog = new Techblog(bot.client, sharedSettings, "data/techblog_data.json");
const apiUrlInterpreter = new ApiUrlInterpreter(bot.client, sharedSettings, apiSchema);
const versionChecker = new VersionChecker(bot.client, sharedSettings, "data/version_data.json");
const notes = new Info(bot, interactionManager, sharedSettings, "data/info_data.json", versionChecker);
const admin = new Admin(bot.client, sharedSettings, "data/admin_data.json", notes);
const react = new AutoReact(bot.client, interactionManager, sharedSettings, "data/thinking_data.json", "data/ignored_react_data.json");
const status = new ApiStatus(sharedSettings);
const libraries = new RiotAPILibraries(sharedSettings);
const esports = new ESportsAPI(bot.client, sharedSettings);
const endpoint = new Endpoint(sharedSettings, "data/endpoints.json");
const pageDiffer = new PageDiffer(bot.client, sharedSettings, "data/page_differ.json");
const spamKiller = new SpamKiller(bot.client, sharedSettings);
const gameData = new GameData(bot.client, sharedSettings);

// Commands controller commands
controller.registerCommand(commandList.controller.toggle, controller.onToggle.bind(controller));
controller.registerCommand(commandList.controller.help, controller.onHelp.bind(controller));

// Botty commands
controller.registerCommand(commandList.botty.restart, bot.onRestart.bind(bot));

// gamedata commands
controller.registerCommand(commandList.gamedata.lookup, gameData.onLookup.bind(gameData));

// Admin commands
controller.registerCommand(commandList.admin.unmute, admin.onUnmute.bind(admin));
controller.registerCommand(commandList.admin.mute, admin.onMute.bind(admin));
controller.registerCommand(commandList.admin.ticket, admin.onTicket.bind(admin));
controller.registerCommand(commandList.admin.kick, admin.onKick.bind(admin));
controller.registerCommand(commandList.admin.ban, admin.onBan.bind(admin));

// Esport commands
controller.registerCommand(commandList.esports.date, esports.onCheckNext.bind(esports));

// API schema commands
controller.registerCommand(commandList.apiSchema.updateSchema, apiSchema.onUpdateSchemaRequest.bind(apiSchema));

// Keyfinder commands
controller.registerCommand(commandList.keyFinder, keyFinder.onKeyList.bind(keyFinder));

// Info commands
controller.registerCommand(commandList.info.note, notes.onNote.bind(notes));
controller.registerCommand(commandList.info.all, notes.onAll.bind(notes));

// Auto react commands
controller.registerCommand(commandList.autoReact.toggle_default_thinking, react.onToggleDefault.bind(react));
controller.registerCommand(commandList.autoReact.refresh_thinking, react.onRefreshThinking.bind(react));
controller.registerCommand(commandList.autoReact.toggle_react, react.onToggleReact.bind(react));

// API status commands
controller.registerCommand(commandList.apiStatus, status.onStatus.bind(status));

// Riot API libraries commands.
controller.registerCommand(commandList.riotApiLibraries, libraries.onLibs.bind(libraries));

// Endpoint commands
controller.registerCommand(commandList.endpointManager.endpoint, endpoint.onEndpoint.bind(endpoint));
controller.registerCommand(commandList.endpointManager.endpoints, endpoint.onList.bind(endpoint));

// start bot
bot.start().catch((reason: any) => {
    console.error(`Unable to run botty: ${reason}.`);
});
