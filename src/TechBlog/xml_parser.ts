const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser();
export function parseXmlString(xmlString: string) {
    return parser.parse(xmlString, "text/xml");
}