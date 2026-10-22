// Generates src/services/*.ts and src/device.ts from spec/services.json.
//
// Run with `bun run generate`. Every service becomes one client class whose
// methods carry the exact UPnP action names and argument names of the device
// SCPD, with argument types derived from each argument's state variable.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One action argument as recorded in the spec. */
interface SpecArg {
  /** The UPnP argument name, e.g. `InstanceID`. */
  name: string;
  /** Whether the argument is sent (`in`) or returned (`out`). */
  direction: 'in' | 'out';
  /** The UPnP data type of the argument's state variable. */
  dataType: 'string' | 'boolean' | 'ui1' | 'ui2' | 'ui4' | 'i1' | 'i2' | 'i4';
  /** The state variable's allowed values, when it restricts them. */
  allowedValues?: string[];
  /** Human description of the argument, when documented. */
  description?: string;
}

/** One action as recorded in the spec. */
interface SpecAction {
  /** The UPnP action name, e.g. `SetAVTransportURI`. */
  name: string;
  /** Human description of the action, "" when undocumented. */
  description: string;
  /** Extra notes on the action's behaviour, "" when none. */
  remarks: string;
  /** Input and output arguments, in SCPD order. */
  args: SpecArg[];
}

/** One service as recorded in the spec. */
interface SpecService {
  /** Short service name, e.g. `AVTransport`. */
  name: string;
  /** Service type URN. */
  serviceType: string;
  /** Service id URN. */
  serviceId: string;
  /** Control endpoint path. */
  controlURL: string;
  /** Event subscription endpoint path. */
  eventSubURL: string;
  /** Human description of the service, "" when undocumented. */
  description: string;
  /** State variables the service reports through events. */
  eventedVariables: string[];
  /** Every action, sorted by name. */
  actions: SpecAction[];
}

/** Regenerates every output file from the spec. */
function main(): void {
  const spec = JSON.parse(readFileSync(join(root, 'spec/services.json'), 'utf8')) as {
    services: SpecService[];
  };
  const servicesDir = join(root, 'src/services');
  rmSync(servicesDir, { recursive: true, force: true });
  mkdirSync(servicesDir, { recursive: true });
  for (const service of spec.services) {
    writeFileSync(join(servicesDir, `${service.name}.ts`), serviceModule(service));
  }
  writeFileSync(join(servicesDir, 'index.ts'), servicesIndex(spec.services));
  writeFileSync(join(root, 'src/device.ts'), deviceModule(spec.services));
}

/** Makes free text safe inside a JSDoc block. */
function docText(text: string): string {
  return text.replace(/\*\//g, '*\\/').trim();
}

/** Renders a JSDoc block at `indent` from non-empty paragraphs. */
function docBlock(indent: string, paragraphs: string[]): string {
  const lines = paragraphs
    .map(docText)
    .filter((p) => p !== '')
    .flatMap((p, i) => (i === 0 ? p.split('\n') : ['', ...p.split('\n')]));
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} *${l === '' ? '' : ` ${l}`}`).join('\n')}\n${indent} */\n`;
}

/** The TypeScript type of an argument. */
function tsType(arg: SpecArg): string {
  if (arg.dataType === 'boolean') return 'boolean';
  if (arg.dataType === 'string') {
    return arg.allowedValues ? arg.allowedValues.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(' | ') : 'string';
  }
  return 'number';
}

/** The codec call that encodes an input argument from `request`. */
function encodeCall(arg: SpecArg): string {
  const value = `request.${arg.name}`;
  if (arg.dataType === 'boolean') return `booleanArg('${arg.name}', ${value})`;
  if (arg.dataType === 'string') return `stringArg('${arg.name}', ${value})`;
  return `integerArg('${arg.name}', ${value}, '${arg.dataType}')`;
}

/** The codec call that decodes an output argument from `out`. */
function decodeCall(arg: SpecArg): string {
  if (arg.dataType === 'boolean') return `readBoolean(out, '${arg.name}')`;
  if (arg.dataType === 'string') {
    const read = `readString(out, '${arg.name}')`;
    return arg.allowedValues ? `${read} as ${tsType(arg)}` : read;
  }
  return `readInteger(out, '${arg.name}')`;
}

/** The codec function an argument's encode or decode call uses. */
function codecName(arg: SpecArg): string {
  const kind = arg.dataType === 'boolean' ? 'boolean' : arg.dataType === 'string' ? 'string' : 'integer';
  if (arg.direction === 'in') return `${kind}Arg`;
  return `read${kind[0].toUpperCase()}${kind.slice(1)}`;
}

/** Renders an argument interface, or '' when there are no arguments. */
function argInterface(name: string, summary: string, args: SpecArg[]): string {
  if (args.length === 0) return '';
  let out = docBlock('', [summary]);
  out += `export interface ${name} {\n`;
  for (const arg of args) {
    out += docBlock('  ', [arg.description ?? `The \`${arg.name}\` argument (UPnP ${arg.dataType}).`]);
    out += `  ${arg.name}: ${tsType(arg)};\n`;
  }
  return out + '}\n\n';
}

/** Renders one action method of a service class. */
function actionMethod(service: SpecService, action: SpecAction): string {
  const inputs = action.args.filter((a) => a.direction === 'in');
  const outputs = action.args.filter((a) => a.direction === 'out');
  const requestType = `${service.name}${action.name}Request`;
  const responseType = `${service.name}${action.name}Response`;
  const params = inputs.length > 0 ? `request: ${requestType}` : '';
  const returns = outputs.length > 0 ? responseType : 'void';
  const summary = action.description || `Calls ${service.name}#${action.name}.`;
  const tags = [
    ...(inputs.length > 0 ? ['@param request - The action\'s input arguments.'] : []),
    ...(outputs.length > 0 ? ['@returns The action\'s output arguments.'] : []),
  ];

  let out = docBlock('  ', [summary, action.remarks, tags.join('\n')]);
  out += `  async ${action.name}(${params}): Promise<${returns}> {\n`;
  const argList =
    inputs.length === 0
      ? '[]'
      : `[\n${inputs.map((a) => `      ${encodeCall(a)},\n`).join('')}    ]`;
  if (outputs.length === 0) {
    out += `    await this.invoke('${action.name}', ${argList});\n`;
  } else {
    out += `    const out = await this.invoke('${action.name}', ${argList});\n`;
    out += '    return {\n';
    for (const a of outputs) out += `      ${a.name}: ${decodeCall(a)},\n`;
    out += '    };\n';
  }
  return out + '  }\n';
}

/** Renders the module for one service. */
function serviceModule(service: SpecService): string {
  const codecs = [...new Set(service.actions.flatMap((a) => a.args.map(codecName)))].sort();
  let out = HEADER + '\n';
  out += "import { SonosService, type ServiceDescriptor } from '../service';\n";
  if (codecs.length > 0) out += `import { ${codecs.join(', ')} } from '../codec';\n`;
  out += '\n';

  out += docBlock('', [`The state variables ${service.name} reports through events.`]);
  const evented = service.eventedVariables.map((v) => `'${v}'`).join(' | ') || 'never';
  out += `export type ${service.name}EventVariable = ${evented};\n\n`;

  for (const action of service.actions) {
    out += argInterface(
      `${service.name}${action.name}Request`,
      `Input arguments of ${service.name}#${action.name}.`,
      action.args.filter((a) => a.direction === 'in'),
    );
    out += argInterface(
      `${service.name}${action.name}Response`,
      `Output arguments of ${service.name}#${action.name}.`,
      action.args.filter((a) => a.direction === 'out'),
    );
  }

  out += docBlock('', [`Identifies the ${service.name} service and its endpoints.`]);
  out += `export const ${service.name}Descriptor: ServiceDescriptor = {\n`;
  out += `  name: '${service.name}',\n`;
  out += `  serviceType: '${service.serviceType}',\n`;
  out += `  serviceId: '${service.serviceId}',\n`;
  out += `  controlURL: '${service.controlURL}',\n`;
  out += `  eventSubURL: '${service.eventSubURL}',\n`;
  out += '};\n\n';

  out += docBlock('', [
    service.description || `Client for the ${service.name} service.`,
    `Every method is one ${service.name} action with its UPnP name and arguments.`,
  ]);
  out += `export class ${service.name}Service extends SonosService {\n`;
  out += `  readonly descriptor = ${service.name}Descriptor;\n`;
  for (const action of service.actions) out += '\n' + actionMethod(service, action);
  return out + '}\n';
}

/** Renders the services barrel. */
function servicesIndex(services: SpecService[]): string {
  return HEADER + '\n' + services.map((s) => `export * from './${s.name}';\n`).join('');
}

/** Renders the SonosDevice class holding one client per service. */
function deviceModule(services: SpecService[]): string {
  let out = HEADER + '\n';
  out += "import type { HttpTransport } from './transport';\n";
  out += 'import {\n';
  for (const s of services) out += `  ${s.name}Service,\n`;
  out += "} from './services';\n\n";
  out += docBlock('', [
    'Every UPnP service of one Sonos device, addressed by its base URL.',
    'A service the device model does not implement (e.g. HTControl on a speaker without a TV input) fails when called.',
  ]);
  out += 'export class SonosDevice {\n';
  for (const s of services) {
    out += docBlock('  ', [`The ${s.name} service.`]);
    out += `  readonly ${s.name}: ${s.name}Service;\n`;
  }
  out += '\n';
  out += docBlock('  ', [
    '@param transport - Performs the HTTP requests.\n@param baseURL - The device base URL, e.g. `http://192.168.1.10:1400`.',
  ]);
  out += '  constructor(\n    transport: HttpTransport,\n    readonly baseURL: string,\n  ) {\n';
  for (const s of services) out += `    this.${s.name} = new ${s.name}Service(transport, baseURL);\n`;
  return out + '  }\n}\n';
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = '// GENERATED by scripts/generate.ts from spec/services.json. Do not edit by hand.\n';

main();
