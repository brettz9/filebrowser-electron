(function () {
	'use strict';

	var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	var jml$1 = {exports: {}};

	var jml = jml$1.exports;

	var hasRequiredJml;

	function requireJml () {
		if (hasRequiredJml) return jml$1.exports;
		hasRequiredJml = 1;
		(function (module, exports$1) {
			(function (global, factory) {
			  factory(exports$1) ;
			})(jml, (function (exports$1) {
			  /* eslint-disable sonarjs/updated-loop-counter -- Ok */
			  /* eslint-disable unicorn/prefer-global-this -- Easier */
			  /* eslint-disable sonarjs/no-control-regex -- Intentional */
			  /*
			  Possible todos:
			  0. Add XSLT to JML-string stylesheet (or even vice versa)

			  Todos inspired by JsonML: https://github.com/mckamey/jsonml/blob/master/jsonml-html.js
			  0. expand ATTR_MAP

			  Other Todos:
			  0. Note to self: Integrate research from other jml notes
			  0. Allow Jamilih to be seeded with an existing element, so as to be able to
			      add/modify attributes and children
			  0. Allow array as single first argument
			  0. Settle on whether need to use null as last argument to return array (or
			      fragment) or other way to allow appending? Options object at end instead
			      to indicate whether returning array, fragment, first element, etc.?
			  0. Allow building of generic XML (pass configuration object)
			  0. Allow building content internally as a string (though allowing DOM methods, etc.?)
			  0. Support JsonML empty string element name to represent fragments?
			  0. Redo browser testing of jml
			  */

			  /**
			   * @typedef {Window & {DocumentFragment: any}} HTMLWindow
			   */

			  /**
			   * @typedef {any} ArbitraryValue
			   */

			  /**
			   * @typedef {number} Integer
			   */

			  /**
			   * @typedef {{
			   *   element: Document|HTMLElement|DocumentFragment,
			   *   attribute: {name: string|null, value: JamilihAttValue},
			   *   opts: JamilihOptions
			   * }} PluginSettings
			   */

			  /**
			   * @typedef {object} JamilihPlugin
			   * @property {string} name
			   * @property {(opts: PluginSettings) => string|Promise<void>} set
			   */

			  /**
			   * @type {import('jsdom').DOMWindow|HTMLWindow|typeof globalThis|undefined}
			   */
			  let win;

			  /* c8 ignore next 3 */
			  if (typeof window !== 'undefined' && window) {
			    win = window;
			  }

			  /* c8 ignore next */
			  let doc = typeof document !== 'undefined' && document || win?.document;

			  // STATIC PROPERTIES

			  const possibleOptions = ['$plugins',
			  // '$mode', // Todo (SVG/XML)
			  // '$state', // Used internally
			  '$map' // Add any other options here
			  ];
			  const NS_HTML = 'http://www.w3.org/1999/xhtml',
			    hyphenForCamelCase = /-([a-z])/gu;
			  const ATTR_MAP = new Map([['maxlength', 'maxLength'], ['minlength', 'minLength'], ['readonly', 'readOnly']]);

			  // We define separately from ATTR_DOM for clarity (and parity with JsonML) but no current need
			  // We don't set attribute esp. for boolean atts as we want to allow setting of `undefined`
			  //   (e.g., from an empty variable) on templates to have no effect
			  const BOOL_ATTS = ['checked', 'defaultChecked', 'defaultSelected', 'disabled', 'indeterminate', 'open',
			  // Dialog elements
			  'readOnly', 'selected'];

			  // From JsonML
			  const ATTR_DOM = new Set([...BOOL_ATTS, 'accessKey',
			  // HTMLElement
			  'async', 'autocapitalize',
			  // HTMLElement
			  'autofocus', 'contentEditable',
			  // HTMLElement through ElementContentEditable
			  'defaultValue', 'defer', 'draggable',
			  // HTMLElement
			  'formnovalidate', 'hidden',
			  // HTMLElement
			  'innerText',
			  // HTMLElement
			  'inputMode',
			  // HTMLElement through ElementContentEditable
			  'ismap', 'multiple', 'novalidate', 'pattern', 'required', 'spellcheck',
			  // HTMLElement
			  'translate',
			  // HTMLElement
			  'value', 'willvalidate']);
			  // Todo: Add more to this as useful for templating
			  //   to avoid setting through nullish value
			  const NULLABLES = new Set(['autocomplete', 'dir',
			  // HTMLElement
			  'integrity',
			  // script, link
			  'lang',
			  // HTMLElement
			  'max', 'min', 'minLength', 'maxLength', 'title' // HTMLElement
			  ]);

			  /**
			   * @param {string} sel
			   * @returns {HTMLElement|null}
			   */
			  const $ = sel => {
			    if (!doc) {
			      throw new Error('No document object');
			    }
			    return doc.querySelector(sel);
			  };

			  /**
			   * @param {string} sel
			   * @returns {HTMLElement[]}
			   */
			  const $$ = sel => {
			    if (!doc) {
			      throw new Error('No document object');
			    }
			    return [...(/** @type {NodeListOf<HTMLElement>} */doc.querySelectorAll(sel))];
			  };

			  /**
			   * @private
			   * @static
			   * @param {Document|DocumentFragment|HTMLElement} parent The parent to which to append the element
			   * @param {Node|string} child The element or other node to append to the parent
			   * @throws {Error} Rethrow if problem with `append` and unhandled
			   * @returns {void}
			   */
			  function _appendNode(parent, child) {
			    const parentName = parent.nodeName?.toLowerCase();
			    if (parentName === 'template') {
			      /** @type {HTMLTemplateElement} */parent.content.append(child);
			      return;
			    }
			    parent.append(child); // IE9 is now ok with this
			  }

			  /**
			   * Attach event in a cross-browser fashion.
			   * @static
			   * @param {HTMLElement} el DOM element to which to attach the event
			   * @param {string} type The DOM event (without 'on') to attach to the element
			   * @param {(evt: Event & {target: HTMLElement}) => void} handler The event handler to attach to the element
			   * @param {boolean} [capturing] Whether or not the event should be
			   *   capturing (W3C-browsers only); default is false; NOT IN USE
			   * @returns {void}
			   */
			  function _addEvent(el, type, handler, capturing) {
			    // @ts-expect-error It's ok
			    el.addEventListener(type, handler, Boolean(capturing));
			  }

			  /**
			  * Creates a text node of the result of resolving an entity or character reference.
			  * @param {'entity'|'decimal'|'hexadecimal'} type Type of reference
			  * @param {string} prefix Text to prefix immediately after the "&"
			  * @param {string} arg The body of the reference
			  * @throws {TypeError}
			  * @returns {Text} The text node of the resolved reference
			  */
			  function _createSafeReference(type, prefix, arg) {
			    /* c8 ignore next 3 */
			    if (!doc) {
			      throw new Error('No document defined');
			    }
			    // For security reasons related to innerHTML, we ensure this string only
			    //  contains potential entity characters
			    if (!/^\w+$/u.test(arg)) {
			      throw new TypeError(`Bad ${type} reference; with prefix "${prefix}" and arg "${arg}"`);
			    }
			    const elContainer = doc.createElement('div');
			    // Todo: No workaround for XML?
			    // // eslint-disable-next-line no-unsanitized/property
			    elContainer.innerHTML = '&' + prefix + arg + ';';
			    return doc.createTextNode(elContainer.innerHTML);
			  }

			  /**
			  * @param {string} n0 Whole expression match (including "-")
			  * @param {string} n1 Lower-case letter match
			  * @returns {string} Uppercased letter
			  */
			  function _upperCase(n0, n1) {
			    return n1.toUpperCase();
			  }

			  // Todo: Make as public utility
			  /**
			   * @param {ArbitraryValue} o
			   * @returns {boolean}
			   */
			  function _isNullish(o) {
			    return o === null || o === undefined;
			  }

			  // Todo: Make as public utility, but also return types for undefined, boolean, number, document, etc.
			  /**
			  * @private
			  * @static
			  * @param {string|JamilihAttributes|JamilihArray|JamilihChildren|
			  *   JamilihDocumentFragment|JamilihAttributeNode|
			  *   JamilihOptions|HTMLElement|Document|DocumentFragment|null|undefined} item
			  * @returns {"string"|"null"|"array"|"element"|"fragment"|"object"|
			  *   "symbol"|"bigint"|"function"|"number"|"boolean"|"undefined"|
			  *   "document"|"processing-instruction"|"non-container node"}
			  */
			  function _getType(item) {
			    const type = typeof item;

			    // Appease TS
			    if (typeof item === 'string' || typeof item === 'undefined') {
			      return 'string';
			    }
			    switch (type) {
			      case 'object':
			        if (item === null) {
			          return 'null';
			        }
			        if (Array.isArray(item)) {
			          return 'array';
			        }
			        if ('nodeType' in item) {
			          switch (item.nodeType) {
			            case 1:
			              return 'element';
			            case 7:
			              return 'processing-instruction';
			            case 9:
			              return 'document';
			            case 11:
			              return 'fragment';
			            default:
			              return 'non-container node';
			          }
			        }
			      // Fallthrough
			      default:
			        return type;
			    }
			  }

			  /**
			  * @private
			  * @static
			  * @param {DocumentFragment} frag
			  * @param {Node} node
			  * @returns {DocumentFragment}
			  */
			  function _fragReducer(frag, node) {
			    frag.append(node);
			    return frag;
			  }

			  /**
			  * @private
			  * @static
			  * @param {Object<string, string>} xmlnsObj
			  * @returns {(...n: string[]) => string}
			  */
			  function _replaceDefiner(xmlnsObj) {
			    /**
			     * @param {string[]} n
			     * @returns {string}
			     */
			    return function (...n) {
			      const n0 = n[0];
			      let retStr = xmlnsObj[''] ? ' xmlns="' + xmlnsObj[''] + '"' : n0; // Preserve XHTML
			      for (const [ns, xmlnsVal] of Object.entries(xmlnsObj)) {
			        if (ns !== '') {
			          retStr += ' xmlns:' + ns + '="' + xmlnsVal + '"';
			        }
			      }
			      return retStr;
			    };
			  }

			  /**
			   * @callback ChildrenToJMLCallback
			   * @param {JamilihArray|JamilihChildType|string} childNodeJML
			   * @param {Integer} i
			   * @returns {void}
			   */

			  /**
			   * @private
			   * @static
			   * @param {Node} node
			   * @returns {ChildrenToJMLCallback}
			   */
			  function _childrenToJML(node) {
			    return function (childNodeJML, i) {
			      const cn = node.childNodes[i];
			      const j = Array.isArray(childNodeJML) ? jml(...(/** @type {JamilihArray} */childNodeJML)) : jml(childNodeJML);
			      cn.replaceWith(j);
			    };
			  }

			  /**
			   * Keep this in sync with `JamilihArray`'s first argument (minus `Document`).
			   * @typedef {JamilihDoc|JamilihDoctype|JamilihTextNode|
			  *   JamilihAttributeNode|JamilihOptions|ElementName|HTMLElement|
			  *   JamilihDocumentFragment
			  * } JamilihFirstArg
			  */

			  /**
			  * @callback JamilihAppender
			  * @param {JamilihArray|JamilihFirstArg|Node|TextNodeString} childJML
			  * @returns {void}
			  */

			  /**
			  * @private
			  * @static
			  * @param {ParentNode} node
			  * @returns {JamilihAppender}
			  */
			  function _appendJML(node) {
			    return function (childJML) {
			      if (typeof childJML === 'string' || typeof childJML === 'number') {
			        throw new TypeError('Unexpected text string/number in the head');
			      }
			      if (Array.isArray(childJML)) {
			        node.append(jml(...childJML));
			      } else if (typeof childJML === 'object' && 'nodeType' in childJML) {
			        node.append(childJML);
			      } else {
			        node.append(jml(childJML));
			      }
			    };
			  }

			  /**
			  * @callback appender
			  * @param {JamilihArray|JamilihFirstArg|Node|TextNodeString} childJML
			  * @returns {void}
			  */

			  /**
			  * @private
			  * @static
			  * @param {ParentNode} node
			  * @returns {appender}
			  */
			  function _appendJMLOrText(node) {
			    return function (childJML) {
			      if (typeof childJML === 'string' || typeof childJML === 'number') {
			        node.append(String(childJML));
			      } else if (Array.isArray(childJML)) {
			        node.append(jml(...childJML));
			      } else if (typeof childJML === 'object' && 'nodeType' in childJML) {
			        node.append(childJML);
			      } else {
			        node.append(jml(childJML));
			      }
			    };
			  }

			  /**
			  * @private
			  * @static
			  */
			  /*
			  function _DOMfromJMLOrString (childNodeJML) {
			    if (typeof childNodeJML === 'string') {
			      return doc.createTextNode(childNodeJML);
			    }
			    return jml(...childNodeJML);
			  }
			  */

			  /**
			  * @typedef {HTMLElement|DocumentFragment|Comment|Attr|
			  *    Text|Document|DocumentType|ProcessingInstruction|CDATASection} JamilihReturn
			  */
			  // 'string|JamilihOptions|JamilihDocumentFragment|JamilihAttributes|(string|JamilihArray)[]

			  /**
			   * Can either be an array of:
			   * 1. JamilihAttributes followed by an array of JamilihArrays or Elements.
			   *     (Cannot be multiple single JamilihArrays despite TS type).
			   * 2. Any number of JamilihArrays.
			   * @typedef {[(JamilihAttributes|JamilihArray|JamilihArray[]|HTMLElement), ...(JamilihArray|JamilihArray[]|HTMLElement)[]]} TemplateJamilihArray
			   */

			  /**
			   * @typedef {(JamilihArray|HTMLElement)[]} ShadowRootJamilihArrayContainer
			   */

			  /**
			   * @typedef {{
			  *   open?: boolean|ShadowRootJamilihArrayContainer,
			  *   closed?: boolean|ShadowRootJamilihArrayContainer,
			  *   template?: string|HTMLTemplateElement|TemplateJamilihArray,
			  *   content?: ShadowRootJamilihArrayContainer|DocumentFragment
			  * }} JamilihShadowRootObject
			   */

			  /**
			   * @typedef {{[key: string]: string}} XmlnsAttributeObject
			   */

			  /**
			   * @typedef {null|XmlnsAttributeObject} XmlnsAttributeValue
			   */

			  /**
			   * @typedef {{
			   *   [key: string]: string|number|null|undefined|DatasetAttributeObject
			   * }} DatasetAttributeObject
			   */

			  /**
			   * @typedef {string|undefined|{[key: string]: string|null}} StyleAttributeValue
			   */

			  /**
			   * @typedef {(this: HTMLElement, event: Event & {target: HTMLElement}) => void} EventHandler
			   */

			  /**
			   * @typedef {{
			   *   [key: string]: EventHandler|[EventHandler, boolean]
			   * }} OnAttributeObject
			   */

			  /**
			   * @typedef {{
			   *   $on?: OnAttributeObject|null
			   * }} OnAttribute
			   */

			  /**
			   * @typedef {boolean} BooleanAttribute
			   */

			  /**
			   * @typedef {((this: HTMLElement, event?: Event) => void)} HandlerAttributeValue
			   */

			  /* eslint-disable jsdoc/valid-types -- jsdoc-type-pratt-parser Bug */
			  /**
			   * @typedef {{
			   *   [key: string]: HandlerAttributeValue
			   * }} OnHandlerObject
			   */

			  /**
			   * @typedef {number} StringifiableNumber
			   */

			  /**
			   * @typedef {{
			   *   name: string,
			   *   systemId?: string,
			   *   publicId?: string
			   * }} JamilihDocumentType
			   */

			  /**
			   * @typedef {string|{extends?: string}} DefineOptions
			   */

			  /**
			   * @typedef {{[key: string]: string|number|boolean|((this: DefineMixin, ...args: any[]) => any)}} DefineMixin
			   */

			  /**
			   * @typedef {{
			   *   new (): HTMLElement;
			   *   prototype: HTMLElement & {[key: string]: any}
			   * }} DefineConstructor
			   */
			  /* eslint-enable jsdoc/valid-types -- https://github.com/jsdoc-type-pratt-parser/jsdoc-type-pratt-parser/issues/131 */

			  /**
			   * @typedef {(this: HTMLElement) => void} DefineUserConstructor
			   */

			  /**
			   * @typedef {[DefineConstructor|DefineUserConstructor|DefineMixin, DefineOptions?]|[DefineConstructor|DefineUserConstructor, DefineMixin?, DefineOptions?]} DefineObjectArray
			   */

			  /**
			   * @typedef {DefineObjectArray|DefineConstructor|DefineMixin|DefineUserConstructor} DefineObject
			   */

			  /**
			   * @typedef {{elem?: HTMLElement, [key: string]: any}} SymbolObject
			   */

			  /**
			   * @typedef {[symbol|string, ((this: HTMLElement, ...args: any[]) => any)|SymbolObject]} SymbolArray
			   */

			  /**
			   * @typedef {null|undefined} NullableAttributeValue
			   */

			  /**
			   * @typedef {[string, object]|string|{[key: string]: any}} PluginValue
			   */

			  /**
			   * @typedef {(string|NullableAttributeValue|BooleanAttribute|
			   *   JamilihArray|JamilihShadowRootObject|StringifiableNumber|
			   *   JamilihDocumentType|JamilihDocument|XmlnsAttributeValue|
			   *   OnAttributeObject|
			   *   HandlerAttributeValue|DefineObject|SymbolArray|PluginReference|
			   *   PluginValue
			   * )} JamilihAttValue
			   */

			  /**
			   * @typedef {{
			  *   [key: string]: string|number|((this: HTMLElement, ...args: any[]) => any)
			  * }} DataAttributeObject
			  */

			  /**
			   * @typedef {{
			   *   $data?: true|string[]|Map<any, any>|WeakMap<any, any>|DataAttributeObject|
			   *     [undefined, DataAttributeObject]|
			   *     [Map<any, any>|WeakMap<any, any>|undefined, DataAttributeObject]
			   * }} DataAttribute
			   */

			  /**
			   * @typedef {{
			   *   dataset?: DatasetAttributeObject
			   * }} DatasetAttribute
			   */

			  /**
			   * @typedef {{
			   *   style?: StyleAttributeValue
			   * }} StyleAttribute
			   */

			  /**
			   * @typedef {{
			   *   $shadow?: JamilihShadowRootObject
			   * }} JamilihShadowRootAttribute
			   */

			  /* eslint-disable jsdoc/valid-types -- jsdoc-type-pratt-parser Bug */
			  /**
			   * @typedef {{
			   *   is?: string|null,
			   *   $define?: DefineObject
			   * }} DefineAttribute
			   */
			  /* eslint-enable jsdoc/valid-types -- jsdoc-type-pratt-parser Bug */

			  /**
			   * @typedef {{
			   *   $custom?: {[key: string]: any}
			   * }} CustomAttribute
			   */

			  /**
			   * @typedef {{
			   *   $symbol?: SymbolArray
			   * }} SymbolAttribute
			   */

			  /**
			   * @typedef {{
			   *   xmlns?: string|null|XmlnsAttributeObject
			   * }} XmlnsAttribute
			   */

			  /**
			   * `OnHandlerObject &` wasn't working, so added `HandlerAttributeValue`.
			   * @typedef {DataAttribute & StyleAttribute & JamilihShadowRootAttribute &
			   * DefineAttribute & DatasetAttribute & CustomAttribute & SymbolAttribute &
			   * OnAttribute & XmlnsAttribute &
			   * Partial<JamilihAttributeNode> & Partial<JamilihTextNode> &
			   * Partial<JamilihDoc> & Partial<JamilihDoctype> & {
			   *   [key: string]: JamilihAttValue|HandlerAttributeValue,
			   * }} JamilihAttributes
			   */

			  /**
			   * @typedef {{
			   *   title?: string,
			   *   xmlDeclaration?: {
			   *     version: string,
			   *     encoding: string,
			   *     standalone: boolean
			   *   },
			   *   childNodes?: JamilihChildType[],
			   *   $DOCTYPE?: JamilihDocumentType,
			   *   head?: JamilihChildren
			   *   body?: JamilihChildren
			   * }} JamilihDocument
			   */

			  /**
			   * @typedef {{
			   *   $document: JamilihDocument
			   * }} JamilihDoc
			   */

			  /**
			   * @typedef {{$DOCTYPE: JamilihDocumentType}} JamilihDoctype
			   */

			  /**
			   * @typedef {JamilihArray|TextNodeString|HTMLElement} JamilihDocumentFragmentContent
			   */

			  /**
			   * @typedef {{'#': JamilihDocumentFragmentContent[]}} JamilihDocumentFragment
			   */

			  /**
			   * @typedef {string} ElementName
			   */

			  /**
			   * @typedef {string|number} TextNodeString
			   */

			  /**
			   * @typedef {{[key: string]: string}} PluginReference
			   */

			  /**
			   * @typedef {(
			   *   JamilihArray|TextNodeString|HTMLElement|Comment|ProcessingInstruction|
			   *   Text|DocumentFragment|JamilihProcessingInstruction|JamilihDocumentFragment|
			   *   PluginReference
			   * )[]} JamilihChildren
			   */

			  // Todo: DocumentType, Comment, ProcessingInstruction, Text
			  // Todo: JamilihCDATANode, JamilihComment, JamilihProcessingInstruction
			  /**
			   * @typedef {Document|ElementName|HTMLElement|DocumentFragment|
			   *   JamilihDocumentFragment|JamilihDoc|JamilihDoctype|JamilihTextNode|
			   *   JamilihAttributeNode} JamilihFirstArgument
			   */

			  /**
			   * This would be clearer with overrides, but using as typedef.
			   *
			   * The optional 0th argument is an Jamilih options object or fragment.
			   *
			   * The first argument is the element to create (by lower-case name) or DOM element.
			   *
			   * The second optional argument are attributes to add with the key as the
			   *   attribute name and value as the attribute value.
			   * The third optional argument are an array of children for this element
			   *   (but raw DOM elements are required to be specified within arrays since
			   *   could not otherwise be distinguished from siblings being added).
			   * The fourth optional argument are a sequence of sibling Elements, represented
			   *   as DOM elements, or string/attributes/children sequences.
			   * The fifth optional argument is the parent to which to attach the element
			   *   (always the last unless followed by null, in which case it is the
			   *   second-to-last).
			   * The sixth last optional argument is null, used to indicate an array of elements
			   *   should be returned.
			   * @typedef {[
			   *   JamilihOptions|JamilihFirstArgument,
			   *   (JamilihFirstArgument|
			   *     JamilihAttributes|
			   *     JamilihChildren|
			   *     HTMLElement|ShadowRoot|
			   *     null)?,
			   *   (JamilihAttributes|
			   *     JamilihChildren|
			   *     HTMLElement|ShadowRoot|
			   *     ElementName|null)?,
			   *   ...(JamilihAttributes|
			   *     JamilihChildren|
			   *     HTMLElement|ShadowRoot|
			   *     ElementName|null)[]
			   * ]} JamilihArray
			   */

			  /**
			   * @typedef {[
			   *   (string|HTMLElement|ShadowRoot), (JamilihArray[]|JamilihAttributes|HTMLElement|ShadowRoot|null)?, ...(JamilihArray[]|HTMLElement|JamilihAttributes|ShadowRoot|null)[]
			   * ]} JamilihArrayPostOptions
			   */

			  /**
			   * @typedef {{
			   *   root: [Map<HTMLElement,any>|WeakMap<HTMLElement,any>, any],
			   *   [key: string]: [Map<HTMLElement,any>|WeakMap<HTMLElement,any>, any]
			   * }} MapWithRoot
			   */

			  /**
			   * @typedef {"root"|"attributeValue"|"element"|"fragment"|"children"|"fragmentChildren"} TraversalState
			   */

			  /**
			   * @typedef {object} JamilihOptions
			   * @property {TraversalState} [$state]
			   * @property {JamilihPlugin[]} [$plugins]
			   * @property {MapWithRoot|[Map<HTMLElement,any>|WeakMap<HTMLElement,any>, any]} [$map]
			   */

			  /**
			   * @param {Document|HTMLElement|DocumentFragment} elem
			   * @param {string|null} att
			   * @param {JamilihAttValue} attVal
			   * @param {JamilihOptions} opts
			   * @param {TraversalState} [state]
			   * @returns {Promise<void>|string|null}
			   */
			  function checkPluginValue(elem, att, attVal, opts, state) {
			    opts.$state = state ?? 'attributeValue';
			    if (attVal && typeof attVal === 'object') {
			      const matchingPlugin = getMatchingPlugin(opts, Object.keys(attVal)[0]);
			      if (matchingPlugin) {
			        return matchingPlugin.set({
			          opts,
			          element: elem,
			          attribute: {
			            name: att,
			            value: attVal
			          }
			        });
			      }
			    }
			    return /** @type {string} */attVal;
			  }

			  /**
			   * @param {JamilihOptions} opts
			   * @param {string} pluginName
			   * @returns {JamilihPlugin|undefined}
			   */
			  function getMatchingPlugin(opts, pluginName) {
			    return opts.$plugins && opts.$plugins.find(p => {
			      return p.name === pluginName;
			    });
			  }

			  /* eslint-disable jsdoc/valid-types -- pratt parser bug  */
			  /**
			   * @template T
			   * @typedef {T[keyof T]} ValueOf
			   */
			  /* eslint-enable jsdoc/valid-types -- pratt parser bug  */

			  /* eslint-disable jsdoc/valid-types -- pratt parser bug  */
			  /**
			   * Creates an XHTML or HTML element (XHTML is preferred, but only in browsers
			   * that support); any element after element can be omitted, and any subsequent
			   * type or types added afterwards.
			   * @template {JamilihArray} T
			   * @param {T} args
			   * @returns {T extends [keyof HTMLElementTagNameMap, any?, any?, any?]
			   *   ? HTMLElementTagNameMap[T[0]] : JamilihReturn}
			   * The newly created (and possibly already appended)
			   *   element or array of elements
			   */
			  const jml = function jml(...args) {
			    /* eslint-enable jsdoc/valid-types -- pratt parser bug  */
			    if (!win) {
			      throw new Error('No window object');
			    }
			    if (!doc) {
			      throw new Error('No document object');
			    }

			    /** @type {(Document|DocumentFragment|HTMLElement) & {[key: string]: any}} */
			    let elem = doc.createDocumentFragment();
			    /**
			     *
			     * @param {JamilihAttributes} atts
			     * @throws {TypeError}
			     * @returns {void}
			     */
			    function _checkAtts(atts) {
			      /* c8 ignore next 3 */
			      if (!doc) {
			        throw new Error('No document object');
			      }
			      for (let [att, attVal] of Object.entries(atts)) {
			        att = ATTR_MAP.has(att) ? String(ATTR_MAP.get(att)) : att;

			        /**
			         * @typedef {any} ElementExpando
			         */

			        if (NULLABLES.has(att)) {
			          attVal = checkPluginValue(elem, att, /** @type {string|JamilihArray} */attVal, opts);
			          if (!_isNullish(attVal)) {
			            /** @type {ElementExpando} */elem[att] = attVal;
			          }
			          continue;
			        } else if (ATTR_DOM.has(att)) {
			          attVal = checkPluginValue(elem, att, /** @type {string|JamilihArray} */attVal, opts);
			          /** @type {ElementExpando} */
			          elem[att] = attVal;
			          continue;
			        }
			        switch (att) {
			          /*
			          Todos:
			          0. JSON mode to prevent event addition
			           0. {$xmlDocument: []} // doc.implementation.createDocument
			           0. Accept array for any attribute with first item as prefix and second as value?
			          0. {$: ['xhtml', 'div']} for prefixed elements
			            case '$': // Element with prefix?
			              nodes[nodes.length] = elem = doc.createElementNS(attVal[0], attVal[1]);
			              break;
			          */
			          case '#':
			            {
			              // Document fragment
			              opts.$state = 'fragmentChildren';
			              nodes[nodes.length] = jml(opts, /** @type {JamilihArray[]} */attVal);
			              break;
			            }
			          case '$shadow':
			            {
			              const {
			                open,
			                closed
			              } = /** @type {JamilihShadowRootObject} */attVal;
			              let {
			                content,
			                template
			              } = /** @type {JamilihShadowRootObject} */attVal;
			              const shadowRoot = /** @type {HTMLElement} */elem.attachShadow({
			                mode: closed || open === false ? 'closed' : 'open'
			              });
			              if (template) {
			                if (Array.isArray(template)) {
			                  template = /** @type {HTMLTemplateElement} */
			                  _getType(template[0]) === 'object' ? jml('template', ...(
			                  /**
			                   * @type {[
			                   *   JamilihAttributes, ...(JamilihArray[]|HTMLElement)[]
			                   * ]}
			                   */
			                  template), doc.body) : jml('template',
			                  /**
			                   * @type {JamilihArray[]|HTMLElement}
			                   */
			                  template, doc.body);
			                } else if (typeof template === 'string') {
			                  template = /** @type {HTMLTemplateElement} */$(template);
			                }
			                jml(/** @type {HTMLTemplateElement} */
			                /** @type {HTMLTemplateElement} */template.content.cloneNode(true), shadowRoot);
			              } else {
			                if (!content) {
			                  if (open !== true) {
			                    content = open || typeof closed === 'boolean' ? content : closed;
			                  }
			                }
			                if (content && typeof content !== 'boolean') {
			                  if (Array.isArray(content)) {
			                    jml({
			                      '#': content
			                    }, shadowRoot);
			                  } else {
			                    jml(content, shadowRoot);
			                  }
			                }
			              }
			              break;
			            }
			          case '$state':
			            {
			              // Handled internally
			              break;
			            }
			          case 'is':
			            {
			              // Currently only in Chrome
			              // Handled during element creation
			              break;
			            }
			          case '$custom':
			            {
			              Object.assign(elem, attVal);
			              break;
			            }
			          case '$define':
			            {
			              if (!('localName' in elem)) {
			                throw new Error('Element expected for `$define`');
			              }
			              const localName = elem.localName.toLowerCase();
			              // Note: customized built-ins sadly not working yet
			              const customizedBuiltIn = !localName.includes('-');

			              // We check attribute in case this is a preexisting DOM element
			              // const {is} = atts;
			              let is;
			              if (customizedBuiltIn) {
			                is = elem.getAttribute('is');
			                if (!is) {
			                  if (!Object.hasOwn(atts, 'is')) {
			                    throw new TypeError(`Expected \`is\` with \`$define\` on built-in; args: ${JSON.stringify(args)}`);
			                  }
			                  atts.is = /** @type {string} */checkPluginValue(elem, 'is', atts.is, opts);
			                  elem.setAttribute('is', atts.is);
			                  ({
			                    is
			                  } = atts);
			                }
			              }
			              const def = customizedBuiltIn ? (/** @type {string} */is) : localName;
			              if (window.customElements.get(def)) {
			                break;
			              }

			              /**
			               * @param {DefineUserConstructor} [cnstrct]
			               * @returns {DefineConstructor}
			               */
			              const getConstructor = cnstrct => {
			                /* c8 ignore next 3 */
			                if (!doc) {
			                  throw new Error('No document object');
			                }
			                const baseClass = typeof options === 'object' && typeof options.extends === 'string' ? (/** @type {typeof HTMLElement} */doc.createElement(options.extends).constructor) : customizedBuiltIn ? (/** @type {typeof HTMLElement} */doc.createElement(localName).constructor) : window.HTMLElement;

			                /**
			                 * Class wrapping base class.
			                 */
			                return cnstrct ? class extends baseClass {
			                  /**
			                   * Calls user constructor.
			                   */
			                  constructor() {
			                    super();
			                    /** @type {DefineUserConstructor} */
			                    cnstrct.call(this);
			                  }
			                } : class extends baseClass {};
			              };

			              /** @type {DefineConstructor|DefineUserConstructor|DefineMixin} */
			              let cnstrctr;

			              /**
			               * @type {DefineOptions|undefined}
			               */
			              let options;
			              let mixin;
			              const defineObj = /** @type {DefineObject} */attVal;
			              if (Array.isArray(defineObj)) {
			                if (defineObj.length <= 2) {
			                  [cnstrctr, options] = defineObj;
			                  if (typeof options === 'string') {
			                    // Todo: Allow creating a definition without using it;
			                    //  that may be the only reason to have a string here which
			                    //  differs from the `localName` anyways
			                    options = {
			                      extends: options
			                    };
			                  } else if (options && !Object.hasOwn(options, 'extends')) {
			                    mixin = options;
			                  }
			                  if (typeof cnstrctr === 'object') {
			                    mixin = cnstrctr;
			                    cnstrctr = getConstructor();
			                  }
			                } else {
			                  [cnstrctr, mixin, options] = defineObj;
			                  if (typeof options === 'string') {
			                    options = {
			                      extends: options
			                    };
			                  }
			                }
			              } else if (typeof defineObj === 'function') {
			                cnstrctr = /** @type {DefineConstructor} */defineObj;
			              } else {
			                mixin = defineObj;
			                cnstrctr = getConstructor();
			              }
			              if (!cnstrctr.toString().startsWith('class')) {
			                cnstrctr = getConstructor(/** @type {DefineUserConstructor} */cnstrctr);
			              }
			              if (!options && customizedBuiltIn) {
			                options = {
			                  extends: localName
			                };
			              }
			              if (mixin) {
			                Object.entries(mixin).forEach(([methodName, method]) => {
			                  /** @type {DefineConstructor} */cnstrctr.prototype[methodName] = method;
			                });
			              }
			              // console.log('def', def, '::', typeof options === 'object' ? options : undefined);
			              window.customElements.define(def, /** @type {DefineConstructor} */cnstrctr, typeof options === 'object' ? options : undefined);
			              break;
			            }
			          case '$symbol':
			            {
			              const [symbol, func] = /** @type {SymbolArray} */attVal;
			              if (typeof func === 'function') {
			                const funcBound = func.bind(/** @type {HTMLElement} */elem);
			                if (typeof symbol === 'string') {
			                  // @ts-expect-error
			                  elem[Symbol.for(symbol)] = funcBound;
			                } else {
			                  // @ts-expect-error
			                  elem[symbol] = funcBound;
			                }
			              } else {
			                const obj = func;
			                obj.elem = /** @type {HTMLElement} */elem;
			                if (typeof symbol === 'string') {
			                  // @ts-expect-error
			                  elem[Symbol.for(symbol)] = obj;
			                } else {
			                  // @ts-expect-error
			                  elem[symbol] = obj;
			                }
			              }
			              break;
			            }
			          case '$data':
			            {
			              setMap(/** @type {true|string[]|Map<any, any>|WeakMap<any, any>|DataAttributeObject} */
			              attVal);
			              break;
			            }
			          case '$attribute':
			            {
			              // Attribute node
			              const attr = /** @type {JamilihAttributeNodeValue} */attVal;
			              const node = attr.length === 3 ? doc.createAttributeNS(attr[0], attr[1]) : doc.createAttribute(/** @type {string} */attr[0]);
			              node.value = /** @type {string} */attr.at(-1);
			              nodes[nodes.length] = node;
			              break;
			            }
			          case '$text':
			            {
			              // Todo: Also allow as jml(['a text node']) (or should that become a fragment)?
			              const node = doc.createTextNode(/** @type {string} */attVal);
			              nodes[nodes.length] = node;
			              break;
			            }
			          case '$document':
			            {
			              // Todo: Conditionally create XML document
			              const docNode = doc.implementation.createHTMLDocument();
			              if (!attVal) {
			                throw new Error('Bad attribute value');
			              }
			              const jamlihDoc = /** @type {JamilihDocument} */attVal;
			              if (jamlihDoc.childNodes) {
			                // Remove any extra nodes created by createHTMLDocument().
			                const j = jamlihDoc.childNodes.length;
			                while (docNode.childNodes[j]) {
			                  const cn = docNode.childNodes[j];
			                  cn.remove();
			                  // `j` should stay the same as removing will cause node to be present
			                }
			                jamlihDoc.childNodes.forEach(_childrenToJML(docNode));
			              } else {
			                if (jamlihDoc.$DOCTYPE) {
			                  const dt = {
			                    $DOCTYPE: jamlihDoc.$DOCTYPE
			                  };
			                  const doctype = jml(dt);
			                  docNode.firstChild?.replaceWith(doctype);
			                }
			                const html = docNode.querySelector('html');
			                const head = html?.querySelector('head');
			                const body = html?.querySelector('body');
			                if (jamlihDoc.title || jamlihDoc.head) {
			                  const meta = doc.createElement('meta');
			                  // eslint-disable-next-line unicorn/text-encoding-identifier-case -- HTML
			                  meta.setAttribute('charset', 'utf-8');
			                  head?.append(meta);
			                  if (jamlihDoc.title) {
			                    docNode.title = jamlihDoc.title; // Appends after meta
			                  }
			                  if (jamlihDoc.head && head) {
			                    // each child of `head` is:
			                    //  (JamilihArray|TextNodeString|HTMLElement|Comment|ProcessingInstruction|
			                    //  Text|DocumentFragment|JamilihProcessingInstruction|JamilihDocumentFragment)

			                    //   * @typedef {JamilihDoc|JamilihDoctype|JamilihTextNode|
			                    //  *   JamilihAttributeNode|JamilihOptions|ElementName|HTMLElement|
			                    //  *   JamilihDocumentFragment
			                    //  * } JamilihFirstArg
			                    // appender childJML param is: JamilihArray|JamilihFirstArg

			                    jamlihDoc.head.forEach(_appendJML(head));
			                  }
			                }
			                if (jamlihDoc.body && body) {
			                  jamlihDoc.body.forEach(_appendJMLOrText(body));
			                }
			              }
			              if (jamlihDoc.xmlDeclaration) {
			                const {
			                  version,
			                  encoding,
			                  standalone
			                } = jamlihDoc.xmlDeclaration;
			                const xmlDeclarationData = `${version ? ` version="${version}"` : ''}${encoding ? ` encoding="${encoding}"` : ''}${standalone ? ` standalone="yes"` : ''}`.slice(1);
			                const xmlDeclaration = doc.createProcessingInstruction('xml', xmlDeclarationData);
			                docNode.insertBefore(xmlDeclaration, docNode.firstChild);
			              }
			              nodes[nodes.length] = docNode;
			              break;
			            }
			          case '$DOCTYPE':
			            {
			              const doctype = /** @type {JamilihDocumentType} */attVal;
			              const node = doc.implementation.createDocumentType(doctype.name, doctype.publicId || '', doctype.systemId || '');
			              nodes[nodes.length] = node;
			              break;
			            }
			          case '$on':
			            {
			              // Events
			              // Allow for no-op by defaulting to `{}`
			              // eslint-disable-next-line prefer-const -- Ok as mixed
			              for (let [p2, val] of Object.entries(/** @type {OnAttributeObject} */attVal || {})) {
			                if (typeof val === 'function') {
			                  val = [val, false];
			                }
			                if (typeof val[0] !== 'function') {
			                  throw new TypeError(`Expect a function for \`$on\`; args: ${JSON.stringify(args)}`);
			                }
			                _addEvent(/** @type {HTMLElement} */elem, p2, val[0], val[1]); // element, event name, handler, capturing
			              }
			              break;
			            }
			          case 'className':
			          case 'class':
			            attVal = checkPluginValue(elem, att, /** @type {string} */attVal, opts);
			            if (!_isNullish(attVal)) {
			              elem.className = attVal;
			            }
			            break;
			          case 'dataset':
			            {
			              // Map can be keyed with hyphenated or camel-cased properties
			              /**
			               * @param {DatasetAttributeObject} atVal
			               * @param {string} startProp
			               * @returns {void}
			               */
			              const recurse = (atVal, startProp) => {
			                let prop = '';
			                const pastInitialProp = startProp !== '';
			                Object.keys(atVal).forEach(key => {
			                  const value = atVal[key];
			                  prop = pastInitialProp ? startProp + key.replaceAll(hyphenForCamelCase, _upperCase).replace(/^([a-z])/u, _upperCase) : startProp + key.replaceAll(hyphenForCamelCase, _upperCase);
			                  if (value === null || typeof value !== 'object') {
			                    if (!_isNullish(value)) {
			                      elem.dataset[prop] = value;
			                    }
			                    prop = startProp;
			                    return;
			                  }
			                  recurse(value, prop);
			                });
			              };
			              recurse(/** @type {DatasetAttributeObject} */attVal, '');
			              break;
			              // Todo: Disable this by default unless configuration explicitly allows (for security)
			            }
			          // #if IS_REMOVE
			          // Don't remove this `if` block (for sake of no-innerHTML build)
			          case 'innerHTML':
			            if (!_isNullish(attVal)) {
			              // // eslint-disable-next-line no-unsanitized/property
			              elem.innerHTML = attVal;
			            }
			            break;
			          // #endif
			          case 'htmlFor':
			          case 'for':
			            if (elStr === 'label') {
			              attVal = checkPluginValue(elem, att, /** @type {string} */attVal, opts);
			              if (!_isNullish(attVal)) {
			                elem.htmlFor = attVal;
			              }
			              break;
			            }
			            attVal = checkPluginValue(elem, att, /** @type {string} */attVal, opts);
			            elem.setAttribute(att, attVal);
			            break;
			          case 'xmlns':
			            // Already handled
			            break;
			          default:
			            {
			              if (att.startsWith('on')) {
			                attVal = checkPluginValue(elem, att, /** @type {HandlerAttributeValue} */attVal, opts);
			                elem[att] = attVal;
			                // _addEvent(elem, att.slice(2), attVal, false); // This worked, but perhaps the user wishes only one event
			                break;
			              }
			              if (att === 'style') {
			                attVal = /** @type {string} */
			                checkPluginValue(elem, att, /** @type {StyleAttributeValue} */attVal, opts);
			                if (_isNullish(attVal)) {
			                  break;
			                }
			                if (typeof attVal === 'object') {
			                  for (const [p2, styleVal] of Object.entries(attVal)) {
			                    if (!_isNullish(styleVal)) {
			                      // Todo: Handle aggregate properties like "border"
			                      if (p2 === 'float') {
			                        elem.style.cssFloat = styleVal;
			                        elem.style.styleFloat = styleVal; // Harmless though we could make conditional on older IE instead
			                      } else {
			                        elem.style[p2.replaceAll(hyphenForCamelCase, _upperCase)] = styleVal;
			                      }
			                    }
			                  }
			                  break;
			                }

			                // setAttribute unfortunately erases any existing styles
			                elem.setAttribute(att, attVal);
			                /*
			                // The following reorders which is troublesome for serialization, e.g., as used in our testing
			                if (elem.style.cssText !== undefined) {
			                  elem.style.cssText += attVal;
			                } else { // Opera
			                  elem.style += attVal;
			                }
			                */
			                break;
			              }
			              const pluginName = att;
			              const matchingPlugin = getMatchingPlugin(opts, pluginName);
			              if (matchingPlugin) {
			                matchingPlugin.set({
			                  opts,
			                  element: (/** @type {HTMLElement} */nodes[0]),
			                  attribute: {
			                    name: pluginName,
			                    value: (/** @type {PluginReference} */attVal)
			                  }
			                });
			                break;
			              }
			              attVal = checkPluginValue(elem, att, /** @type {string} */attVal, opts);
			              elem.setAttribute(att, attVal);
			              break;
			            }
			        }
			      }
			    }

			    /**
			     * @type {JamilihReturn[]}
			     */
			    const nodes = [];

			    /** @type {string} */
			    let elStr;

			    /** @type {JamilihOptions} */
			    let opts;
			    let isRoot = false;
			    let argStart = 0;
			    if (_getType(args[0]) === 'object' && Object.keys(args[0]).some(key => possibleOptions.includes(key))) {
			      opts = /** @type {JamilihOptions} */args[0];
			      if (opts.$state === undefined) {
			        isRoot = true;
			        opts.$state = 'root';
			      }
			      if (Array.isArray(opts.$map)) {
			        opts.$map = {
			          root: opts.$map
			        };
			      }
			      if ('$plugins' in opts) {
			        if (!Array.isArray(opts.$plugins)) {
			          throw new TypeError(`\`$plugins\` must be an array; args: ${JSON.stringify(args)}`);
			        }
			        opts.$plugins.forEach(pluginObj => {
			          if (!pluginObj || typeof pluginObj !== 'object') {
			            throw new TypeError(`Plugin must be an object; args: ${JSON.stringify(args)}`);
			          }
			          if (!pluginObj.name || !pluginObj.name.startsWith('$_')) {
			            throw new TypeError(`Plugin object name must be present and begin with \`$_\`; args: ${JSON.stringify(args)}`);
			          }
			          if (typeof pluginObj.set !== 'function') {
			            throw new TypeError(`Plugin object must have a \`set\` method; args: ${JSON.stringify(args)}`);
			          }
			        });
			      }
			      argStart = 1;
			    } else {
			      opts = {
			        $state: undefined
			      };
			    }
			    const argc = args.length;
			    const defaultMap = opts.$map && /** @type {MapWithRoot} */opts.$map.root;

			    /**
			     * @param {true|string[]|Map<any, any>|WeakMap<any, any>|DataAttributeObject} dataVal
			     * @returns {void}
			     */
			    const setMap = dataVal => {
			      let map, obj;
			      const defMap = /** @type {[Map<HTMLElement, any> | WeakMap<HTMLElement, any>, any]} */defaultMap;
			      // Boolean indicating use of default map and object
			      if (dataVal === true) {
			        [map, obj] = defMap;
			      } else if (Array.isArray(dataVal)) {
			        // Array of strings mapping to default
			        if (typeof dataVal[0] === 'string') {
			          dataVal.forEach(dVal => {
			            setMap(/** @type {MapWithRoot} */opts.$map[dVal]);
			          });
			          return;
			          // Array of Map and non-map data object
			        }
			        map = dataVal[0] || defMap[0];
			        obj = dataVal[1] || defMap[1];
			        // Map
			      } else if (/^\[object (?:Weak)?Map\]$/u.test([].toString.call(dataVal))) {
			        map = dataVal;
			        obj = defMap[1];
			        // Non-map data object
			      } else {
			        map = defMap[0];
			        obj = dataVal;
			      }
			      /** @type {Map<HTMLElement, any> | WeakMap<HTMLElement, any>} */
			      map.set(/** @type {HTMLElement} */
			      elem, obj);
			    };
			    for (let i = argStart; i < argc; i++) {
			      let arg = args[i];
			      const type = _getType(arg);
			      switch (type) {
			        case 'null':
			          // null always indicates a place-holder (only needed for last argument if want array returned)
			          if (i === argc - 1) {
			            // Casting needing unless changing `jml()` signature with overloads
			            return /** @type {ArbitraryValue} */nodes.length <= 1 ? nodes[0]
			            // eslint-disable-next-line unicorn/no-array-callback-reference
			            : nodes.reduce(_fragReducer, doc.createDocumentFragment()); // nodes;
			          }
			          throw new TypeError(`\`null\` values not allowed except as final Jamilih argument; index ${i} on args: ${JSON.stringify(args)}`);
			        case 'string':
			          // Strings normally indicate elements
			          switch (arg) {
			            case '!':
			              nodes[nodes.length] = doc.createComment(/** @type {string} */args[++i]);
			              break;
			            case '?':
			              {
			                arg = /** @type {string} */args[++i];
			                let procValue = /** @type {string} */args[++i];
			                const val = procValue;
			                if (val && typeof val === 'object') {
			                  const procValues = [];
			                  for (const [p, procInstVal] of Object.entries(val)) {
			                    procValues.push(p + '=' + '"' +
			                    // https://www.w3.org/TR/xml-stylesheet/#NT-PseudoAttValue
			                    procInstVal.replaceAll('"', '&quot;') + '"');
			                  }
			                  procValue = procValues.join(' ');
			                }
			                // Firefox allows instructions with ">" in this method, but not if placed directly!
			                try {
			                  nodes[nodes.length] = doc.createProcessingInstruction(arg, procValue);
			                } catch (e) {
			                  // Getting NotSupportedError in IE, so we try to imitate a processing instruction with a comment
			                  // innerHTML didn't work
			                  // var elContainer = doc.createElement('div');
			                  // elContainer.innerHTML = '<?' + doc.createTextNode(arg + ' ' + procValue).nodeValue + '?>';
			                  // nodes[nodes.length] = elContainer.innerHTML;
			                  // Todo: any other way to resolve? Just use XML?
			                  nodes[nodes.length] = doc.createComment('?' + arg + ' ' + procValue + '?');
			                }
			                break;
			                // Browsers don't support doc.createEntityReference, so we just use this as a convenience
			              }
			            case '&':
			              nodes[nodes.length] = _createSafeReference('entity', '', /** @type {string} */
			              args[++i]);
			              break;
			            case '#':
			              // // Decimal character reference - ['#', '01234'] // &#01234; // probably easier to use JavaScript Unicode escapes
			              nodes[nodes.length] = _createSafeReference('decimal', arg, String(args[++i]));
			              break;
			            case '#x':
			              // Hex character reference - ['#x', '123a'] // &#x123a; // probably easier to use JavaScript Unicode escapes
			              nodes[nodes.length] = _createSafeReference('hexadecimal', arg, /** @type {string} */
			              args[++i]);
			              break;
			            case '![':
			              // '![', ['escaped <&> text'] // <![CDATA[escaped <&> text]]>
			              // CDATA valid in XML only, so we'll just treat as text for mutual compatibility
			              // Todo: config (or detection via some kind of doc.documentType property?) of whether in XML
			              try {
			                nodes[nodes.length] = doc.createCDATASection(/** @type {string} */args[++i]);
			              } catch (e2) {
			                nodes[nodes.length] = doc.createTextNode(/** @type {string} */
			                args[i]); // i already incremented
			              }
			              break;
			            case '':
			              nodes[nodes.length] = elem = doc.createDocumentFragment();
			              // Todo: Report to plugins
			              opts.$state = 'fragment';
			              break;
			            default:
			              {
			                // An element
			                elStr = /** @type {string} */arg;
			                const atts = args[i + 1];
			                if (atts && _getType(atts) === 'object' && /** @type {JamilihAttributes} */atts.is) {
			                  const {
			                    is
			                  } = /** @type {JamilihAttributes} */atts;
			                  /* c8 ignore next 4 */
			                  elem = doc.createElementNS
			                  // Should create separate file for this
			                  /* eslint-disable object-shorthand -- Casting */ ? (/** @type {HTMLElement} */doc.createElementNS(NS_HTML, elStr, {
			                    is: (/** @type {string} */is)
			                  })
			                  /* c8 ignore next 1 */) : doc.createElement(elStr, {
			                    is: (/** @type {string} */is)
			                  });
			                  /* eslint-enable object-shorthand -- Casting */
			                } else /* c8 ignore next */if (doc.createElementNS) {
			                    elem = doc.createElementNS(NS_HTML, elStr);
			                    /* c8 ignore next 3 */
			                  } else {
			                    elem = doc.createElement(elStr);
			                  }
			                // Todo: Report to plugins
			                opts.$state = 'element';
			                nodes[nodes.length] = elem; // Add to parent
			                break;
			              }
			          }
			          break;
			        case 'object':
			          {
			            // Non-DOM-element objects indicate attribute-value pairs
			            /* c8 ignore next 3 */
			            if (!arg || typeof arg !== 'object') {
			              throw new Error('Null should not reach here');
			            }
			            const atts = arg;
			            if ('xmlns' in atts) {
			              // We handle this here, as otherwise may lose events, etc.
			              // As namespace of element already set as XHTML, we need to change the namespace
			              // elem.setAttribute('xmlns', atts.xmlns); // Doesn't work
			              // Can't set namespaceURI dynamically, renameNode() is not supported, and setAttribute() doesn't work to change the namespace, so we resort to this hack
			              const xmlnsObj = /** @type {XmlnsAttributeObject} */atts;
			              const replacer = xmlnsObj.xmlns && typeof xmlnsObj.xmlns === 'object' ? _replaceDefiner(xmlnsObj.xmlns) : ' xmlns="' + xmlnsObj.xmlns + '"';
			              // try {
			              // Also fix DOMParser to work with text/html
			              elem = nodes[nodes.length - 1] =
			              // Why doesn't `HTMLWindow` have `DOMParser`?
			              new /** @type {import('jsdom').DOMWindow} */win.DOMParser().parseFromString(new /** @type {import('jsdom').DOMWindow} */win.XMLSerializer().serializeToString(elem).
			              // Mozilla adds XHTML namespace
			              replace(' xmlns="' + NS_HTML + '"',
			              // Needed to cast here, despite either overload working
			              /** @type {string} */
			              replacer), 'application/xml').documentElement;
			              // Todo: Report to plugins
			              opts.$state = 'element';
			              // }catch(e) {alert(elem.outerHTML);throw e;}
			            }
			            _checkAtts(/** @type {JamilihAttributes} */atts);
			            break;
			          }
			        case 'processing-instruction':
			        case 'document':
			        case 'fragment':
			        case 'element':
			          /*
			          1) Last element always the parent (put null if don't want parent and want to return array) unless only atts and children (no other elements)
			          2) Individual elements (DOM elements or sequences of string[/object/array]) get added to parent first-in, first-added
			          */
			          if (i === 0) {
			            // Allow wrapping of element, fragment, or document
			            elem = /** @type {Document|DocumentFragment|HTMLElement} */arg;
			            // Todo: Report to plugins and change for document/fragment
			            opts.$state = 'element';
			          }
			          if (i === argc - 1 || i === argc - 2 && args[i + 1] === null) {
			            // parent
			            const elsl = nodes.length;
			            for (let k = 0; k < elsl; k++) {
			              _appendNode(/** @type {Document|DocumentFragment|HTMLElement} */arg, nodes[k]);
			            }
			          } else {
			            nodes[nodes.length] = /** @type {Document|DocumentFragment|HTMLElement} */arg;
			          }
			          break;
			        case 'array':
			          {
			            // Arrays or arrays of arrays indicate child nodes
			            const child = /** @type {JamilihChildren} */arg;
			            const cl = child.length;
			            for (let j = 0; j < cl; j++) {
			              // Go through children array container to handle elements
			              const childContent = child[j];
			              const childContentType = typeof childContent;
			              if (childContent === null || _isNullish(childContent)) {
			                throw new TypeError(`Bad children (parent array: ${JSON.stringify(args)}; index ${j} of child: ${JSON.stringify(child)})`);
			              }
			              switch (childContentType) {
			                // Todo: determine whether null or function should have special handling or be converted to text
			                case 'string':
			                case 'number':
			                case 'boolean':
			                  _appendNode(elem, doc.createTextNode(String(childContent)));
			                  break;
			                default:
			                  // bigint, symbol, function
			                  if (typeof childContent !== 'object') {
			                    throw new TypeError(`Bad children (parent array: ${JSON.stringify(args)}; index ${j} of child: ${JSON.stringify(child)})`);
			                  }
			                  if (Array.isArray(childContent)) {
			                    // Arrays representing child elements
			                    opts.$state = 'children';
			                    _appendNode(elem, jml(opts, ...childContent));
			                  } else if ('#' in childContent) {
			                    // Fragment
			                    opts.$state = 'fragmentChildren';
			                    _appendNode(elem, jml(opts, childContent['#']));
			                  } else {
			                    // Single DOM element children or plugin
			                    let newChildContent;
			                    if (!('nodeType' in childContent)) {
			                      newChildContent = /** @type {string} */
			                      checkPluginValue(elem, null, childContent, opts, 'children');
			                    }
			                    _appendNode(elem, /** @type {string|HTMLElement|DocumentFragment|Comment} */
			                    newChildContent || childContent);
			                  }
			                  break;
			              }
			            }
			            break;
			          }
			        default:
			          throw new TypeError(`Unexpected type: ${type}; arg: ${arg}; index ${i} on args: ${JSON.stringify(args)}`);
			      }
			    }
			    const ret = nodes[0] || elem;
			    if (isRoot && opts.$map && /** @type {MapWithRoot} */opts.$map.root) {
			      setMap(true);
			    }

			    // Casting needing unless changing `jml()` signature with overloads
			    return /** @type {ArbitraryValue} */ret;
			  };

			  /**
			   * Configuration object.
			   * @typedef {object} ToJmlConfig
			   * @property {boolean} [stringOutput=false] Whether to output the Jamilih object as a string.
			   * @property {boolean} [reportInvalidState=true] If true (the default), will report invalid state errors
			   * @property {boolean} [stripWhitespace=false] Strip whitespace for text nodes
			   */

			  /**
			   * @typedef {[namespace: string|null, name: string, value?: string]} JamilihAttributeNodeValue
			   */

			  /**
			   * @typedef {{
			   *   $attribute: JamilihAttributeNodeValue
			   * }} JamilihAttributeNode
			   */

			  /**
			   * @typedef {{
			   *   $text: string
			   * }} JamilihTextNode
			   */

			  /**
			   * @typedef {['![', string]} JamilihCDATANode
			   */

			  /**
			   * @typedef {['&', string]} JamilihEntityReference
			   */

			  /**
			   * @typedef {[code: '?', target: string, value: string]} JamilihProcessingInstruction
			   */

			  /**
			   * @typedef {[code: '!', value: string]} JamilihComment
			   */

			  /**
			   * @typedef {{
			   *   nodeType: number,
			   *   nodeName: string
			   * }} Entity
			   */

			  /* eslint-disable no-shadow, unicorn/custom-error-definition */
			  /**
			   * Polyfill for `DOMException`.
			   */
			  class DOMException extends Error {
			    /* eslint-enable no-shadow, unicorn/custom-error-definition */
			    /**
			     * @param {string} message
			     * @param {string} name
			     */
			    constructor(message, name) {
			      super(message);
			      this.code = 0;
			      // eslint-disable-next-line unicorn/custom-error-definition
			      this.name = name;
			    }
			  }

			  /**
			   * @typedef {JamilihArray|JamilihDoctype|
			  *    JamilihCDATANode|JamilihEntityReference|JamilihProcessingInstruction|
			  *    JamilihComment|JamilihDocumentFragment} JamilihChildType
			   */

			  /**
			   * @typedef {JamilihDoc|JamilihAttributeNode|JamilihChildType} JamilihType
			   */

			  /**
			  * Converts a DOM object or a string of HTML into a Jamilih object (or string).
			  * @param {string|HTMLElement|Node|Entity} nde If a string, will parse as document
			  * @param {ToJmlConfig} [config] Configuration object
			  * @throws {TypeError}
			  * @returns {JamilihType|string} Array containing the elements which represent
			  * a Jamilih object, or, if `stringOutput` is true, it will be the stringified
			  * version of such an object
			  */
			  jml.toJML = function (nde, {
			    stringOutput = false,
			    reportInvalidState = true,
			    stripWhitespace = false
			  } = {}) {
			    if (!win) {
			      throw new Error('No window object set');
			    }
			    if (typeof nde === 'string') {
			      nde = new /** @type {import('jsdom').DOMWindow} */win.DOMParser().parseFromString(nde, 'text/html'); // todo: Give option for XML once implemented and change JSDoc to allow for Element
			    }
			    const dom = /** @type {HTMLElement|Node|Entity} */nde;

			    /**
			     * @todo Find more specific type than `any`
			     * @typedef {{[key: (number|string)]: any}} IndexableObject
			     */

			    const ret = /** @type {IndexableObject} */[];
			    let parent = ret;
			    let parentIdx = 0;

			    /**
			     * @param {string} msg
			     * @throws {DOMException}
			     * @returns {void}
			     */
			    function invalidStateError(msg) {
			      // These are probably only necessary if working with text/html
			      if (reportInvalidState) {
			        // INVALID_STATE_ERR per section 9.3 XHTML 5: http://www.w3.org/TR/html5/the-xhtml-syntax.html
			        const e = new DOMException(msg, 'INVALID_STATE_ERR');
			        e.code = 11;
			        throw e;
			      }
			    }

			    /**
			     *
			     * @param {JamilihDocumentType} obj
			     * @param {DocumentType} node
			     * @returns {void}
			     */
			    function addExternalID(obj, node) {
			      if (node.systemId.includes('"') && node.systemId.includes("'")) {
			        invalidStateError('systemId cannot have both single and double quotes.');
			      }
			      const {
			        publicId,
			        systemId
			      } = node;
			      if (systemId) {
			        obj.systemId = systemId;
			      }
			      if (publicId) {
			        obj.publicId = publicId;
			      }
			    }

			    /**
			     *
			     * @param {ArbitraryValue} val
			     * @returns {void}
			     */
			    function set(val) {
			      parent[parentIdx] = val;
			      parentIdx++;
			    }

			    /**
			     * @returns {void}
			     */
			    function setChildren() {
			      set([]);
			      parent = parent[parentIdx - 1];
			      parentIdx = 0;
			    }

			    /**
			     *
			     * @param {string} prop1
			     * @param {string} [prop2]
			     * @returns {void}
			     */
			    function setObj(prop1, prop2) {
			      parent = parent[parentIdx - 1][prop1];
			      parentIdx = 0;
			      if (prop2) {
			        parent = parent[prop2];
			      }
			    }

			    /**
			     *
			     * @param {Node|Entity} nodeOrEntity
			     * @param {Object<string, string|null>} namespaces
			     * @throws {TypeError}
			     * @returns {void}
			     */
			    function parseDOM(nodeOrEntity, namespaces) {
			      // namespaces = clone(namespaces) || {}; // Ensure we're working with a copy, so different levels in the hierarchy can treat it differently

			      /*
			      if ((nodeOrEntity.prefix && nodeOrEntity.prefix.includes(':')) || (nodeOrEntity.localName && nodeOrEntity.localName.includes(':'))) {
			        invalidStateError('Prefix cannot have a colon');
			      }
			      */

			      const type = 'nodeType' in nodeOrEntity ? nodeOrEntity.nodeType : null;
			      if (!type) {
			        throw new TypeError('Not an XML type');
			      }
			      if (type === 5) {
			        // ENTITY REFERENCE (though not in browsers (was already resolved
			        //  anyways), ok to keep for parity with our "entity" shorthand)
			        set(['&', nodeOrEntity.nodeName]);
			        return;
			      }
			      namespaces = {
			        ...namespaces
			      };
			      const xmlChars = /^([\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/u; // eslint-disable-line no-control-regex
			      if ([2, 3, 4, 7, 8].includes(type) && /** @type {Node} */nodeOrEntity.nodeValue && !xmlChars.test(/** @type {Node} */nodeOrEntity.nodeValue)) {
			        invalidStateError('Node has bad XML character value');
			      }

			      /**
			       * @type {IndexableObject}
			       */
			      let tmpParent;

			      /**
			       * @type {Integer}
			       */
			      let tmpParentIdx;

			      /**
			       * @returns {void}
			       */
			      function setTemp() {
			        tmpParent = parent;
			        tmpParentIdx = parentIdx;
			      }
			      /**
			       * @returns {void}
			       */
			      function resetTemp() {
			        parent = tmpParent;
			        parentIdx = tmpParentIdx;
			        parentIdx++; // Increment index in parent container of this element
			      }
			      switch (type) {
			        case 1:
			          {
			            // ELEMENT
			            const node = /** @type {HTMLElement} */nodeOrEntity;
			            setTemp();
			            const nodeName = node.nodeName.toLowerCase(); // Todo: for XML, should not lower-case

			            setChildren(); // Build child array since elements are, except at the top level, encapsulated in arrays
			            set(nodeName);

			            /**
			             * @type {{[key: string]: string|null} & {xmlns?: string|null}}
			             */
			            const start = {};
			            let hasNamespaceDeclaration = false;
			            if (namespaces[node.prefix || ''] !== node.namespaceURI) {
			              namespaces[node.prefix || ''] = node.namespaceURI;
			              if (node.prefix) {
			                start['xmlns:' + node.prefix] = node.namespaceURI;
			              } else if (node.namespaceURI) {
			                start.xmlns = node.namespaceURI;
			              } else {
			                start.xmlns = null;
			              }
			              hasNamespaceDeclaration = true;
			            }
			            if (node.attributes.length) {
			              set([...node.attributes].reduce(function (obj, att) {
			                obj[att.name] = att.value; // Attr.nodeName and Attr.nodeValue are deprecated as of DOM4 as Attr no longer inherits from Node, so we can safely use name and value
			                return obj;
			              }, start));
			            } else if (hasNamespaceDeclaration) {
			              set(start);
			            }
			            const {
			              childNodes
			            } = node;
			            if (childNodes.length) {
			              setChildren(); // Element children array container
			              [...childNodes].forEach(function (childNode) {
			                parseDOM(childNode, namespaces);
			              });
			            }
			            resetTemp();
			            break;
			          }
			        case 2:
			          {
			            // ATTRIBUTE (should only get here if passing in an attribute node)
			            const node = /** @type {Attr} */nodeOrEntity;
			            set({
			              $attribute: [node.namespaceURI, node.name, node.value]
			            });
			            break;
			          }
			        case 3:
			          {
			            // TEXT
			            const node = /** @type {Text} */nodeOrEntity;
			            /* c8 ignore next 3 */
			            if (!node.nodeValue) {
			              throw new Error('Unexpected null comment value');
			            }
			            if (stripWhitespace && /^\s+$/u.test(node.nodeValue)) {
			              set('');
			              return;
			            }
			            set(node.nodeValue);
			            break;
			          }
			        case 4:
			          {
			            // CDATA
			            const node = /** @type {CDATASection} */nodeOrEntity;
			            if (node.nodeValue?.includes(']]' + '>')) {
			              invalidStateError('CDATA cannot end with closing ]]>');
			            }
			            set(['![', node.nodeValue]);
			            break;
			          }
			        // case 5:
			        // Handled earlier
			        case 7:
			          {
			            // PROCESSING INSTRUCTION
			            const node = /** @type {ProcessingInstruction} */nodeOrEntity;
			            if (/^xml$/iu.test(node.target)) {
			              invalidStateError('Processing instructions cannot be "xml".');
			            }
			            if (node.target.includes('?>')) {
			              invalidStateError('Processing instruction targets cannot include ?>');
			            }
			            if (node.target.includes(':')) {
			              invalidStateError('The processing instruction target cannot include ":"');
			            }
			            if (node.data.includes('?>')) {
			              invalidStateError('Processing instruction data cannot include ?>');
			            }
			            set(['?', node.target, node.data]); // Todo: Could give option to attempt to convert value back into object if has pseudo-attributes
			            break;
			          }
			        case 8:
			          {
			            // COMMENT
			            const node = /** @type {Comment} */nodeOrEntity;
			            /* c8 ignore next 3 */
			            if (!node.nodeValue) {
			              throw new Error('Unexpected null comment value');
			            }
			            if (node.nodeValue.includes('--') || node.nodeValue.length && node.nodeValue.lastIndexOf('-') === node.nodeValue.length - 1) {
			              invalidStateError('Comments cannot include --');
			            }
			            set(['!', node.nodeValue]);
			            break;
			          }
			        case 9:
			          {
			            // DOCUMENT
			            const node = /** @type {Document} */nodeOrEntity;
			            setTemp();
			            const docObj = {
			              $document: {
			                childNodes: []
			              }
			            };
			            set(docObj); // doc.implementation.createHTMLDocument

			            // Set position to fragment's array children
			            setObj('$document', 'childNodes');
			            const {
			              childNodes
			            } = node;
			            if (!childNodes.length) {
			              invalidStateError('Documents must have a child node');
			            }
			            // set({$xmlDocument: []}); // doc.implementation.createDocument // Todo: use this conditionally

			            [...childNodes].forEach(function (childNode) {
			              // Can't just do documentElement as there may be doctype, comments, etc.
			              // No need for setChildren, as we have already built the container array
			              parseDOM(childNode, namespaces);
			            });
			            resetTemp();
			            break;
			          }
			        case 10:
			          {
			            // DOCUMENT TYPE
			            const node = /** @type {DocumentType} */nodeOrEntity;
			            setTemp();

			            // Can create directly by doc.implementation.createDocumentType
			            const start = {
			              $DOCTYPE: {
			                name: /** @type {DocumentType} */node.name
			              }
			            };
			            const pubIdChar = /^(\u0020|\u000D|\u000A|[a-zA-Z0-9]|[-'()+,./:=?;!*#@$_%])*$/u; // eslint-disable-line no-control-regex
			            if (!pubIdChar.test(/** @type {DocumentType} */node.publicId)) {
			              invalidStateError('A publicId must have valid characters.');
			            }
			            addExternalID(start.$DOCTYPE, node);
			            // Fit in internal subset along with entities?: probably don't need as these would only differ if from DTD, and we're not rebuilding the DTD
			            set(start); // Auto-generate the internalSubset instead?

			            resetTemp();
			            break;
			          }
			        case 11:
			          {
			            // DOCUMENT FRAGMENT
			            const node = /** @type {DocumentFragment} */nodeOrEntity;
			            setTemp();
			            set({
			              '#': []
			            });

			            // Set position to fragment's array children
			            setObj('#');
			            const {
			              childNodes
			            } = node;
			            [...childNodes].forEach(function (childNode) {
			              // No need for setChildren, as we have already built the container array
			              parseDOM(childNode, namespaces);
			            });
			            resetTemp();
			            break;
			          }
			        default:
			          throw new TypeError('Not an XML type');
			      }
			    }
			    parseDOM(dom, {});
			    if (stringOutput) {
			      return JSON.stringify(ret[0]);
			    }
			    return ret[0];
			  };

			  /**
			   * @param {string|HTMLElement} dom
			   * @param {ToJmlConfig} [config]
			   * @returns {string}
			   */
			  jml.toJMLString = function (dom, config) {
			    return /** @type {string} */jml.toJML(dom, Object.assign(config || {}, {
			      stringOutput: true
			    }));
			  };

			  /**
			   *
			   * @param {JamilihArray} args
			   * @returns {JamilihReturn}
			   */
			  jml.toDOM = function (...args) {
			    // Alias for jml()
			    return jml(...args);
			  };

			  /**
			   *
			   * @param {JamilihArray} args
			   * @returns {string}
			   */
			  jml.toHTML = function (...args) {
			    // Todo: Replace this with version of jml() that directly builds a string
			    const ret = jml(...args);
			    switch (ret.nodeType) {
			      case 1:
			        {
			          // Element
			          // Todo: deal with serialization of properties like 'selected',
			          //  'checked', 'value', 'defaultValue', 'for', 'dataset', 'on*',
			          //  'style'! (i.e., need to build a string ourselves)
			          return /** @type {HTMLElement} */ret.outerHTML;
			        }
			      case 2:
			        {
			          // ATTR
			          return `${/** @type {Attr} */ret.name}="${/** @type {Attr} */ret.value.replaceAll('"', '&quot;')}"`;
			        }
			      case 3:
			        {
			          // TEXT
			          // Fallthrough
			          // } case 4: { // CDATA
			          /* c8 ignore next 3 */
			          if (!ret.nodeValue) {
			            throw new TypeError('Unexpected null Text node');
			          }
			          return /** @type {Text|CDATASection} */ret.nodeValue;
			          // case 5: // Entity Reference Node
			          //  No 6: Entity Node
			          //  No 12: Notation Node
			        }
			      case 7:
			        {
			          // PROCESSING INSTRUCTION
			          const node = /** @type {ProcessingInstruction} */ret;
			          return `<?${node.target} ${node.data}?>`;
			          // } case 8: { // Comment
			          //   return `<!--${ret.nodeValue}-->`;
			          // eslint-disable-next-line sonarjs/no-fallthrough
			        }
			      case 9:
			      case 11:
			        {
			          // DOCUMENT FRAGMENT
			          const node = /** @type {DocumentFragment} */ret;
			          return [...node.childNodes].map(childNode => {
			            return jml.toHTML(/** @type {JamilihFirstArgument} */childNode);
			          }).join('');
			        }
			      case 10:
			        {
			          // DOCUMENT TYPE
			          const node = /** @type {DocumentType} */ret;
			          return `<!DOCTYPE ${node.name}${node.publicId ? ` PUBLIC "${node.publicId}" "${node.systemId}"` : node.systemId ? ` SYSTEM "${node.systemId}"` : ``}>`;
			          /* c8 ignore next 3 */
			        }
			      default:
			        throw new Error('Unexpected node type');
			    }
			  };

			  /**
			   *
			   * @param {JamilihArray} args
			   * @returns {string}
			   */
			  jml.toDOMString = function (...args) {
			    // Alias for jml.toHTML for parity with jml.toJMLString
			    return jml.toHTML(...args);
			  };

			  /**
			   *
			   * @param {JamilihArray} args
			   * @returns {string}
			   */
			  jml.toXML = function (...args) {
			    if (!win) {
			      throw new Error('No window object set');
			    }
			    const ret = jml(...args);
			    return new /** @type {import('jsdom').DOMWindow} */win.XMLSerializer().serializeToString(ret);
			  };

			  /**
			   *
			   * @param {JamilihArray} args
			   * @returns {string}
			   */
			  jml.toXMLDOMString = function (...args) {
			    // Alias for jml.toXML for parity with jml.toJMLString
			    return jml.toXML(...args);
			  };

			  /**
			   * Element-aware wrapper for `Map`.
			   */
			  class JamilihMap extends Map {
			    /**
			     * @param {?(string|HTMLElement)} element
			     * @returns {ArbitraryValue}
			     */
			    get(element) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      return super.get.call(this, elem);
			    }
			    /**
			     * @param {string|HTMLElement} element
			     * @param {ArbitraryValue} value
			     * @returns {ArbitraryValue}
			     */
			    set(element, value) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      return super.set.call(this, elem, value);
			    }
			    /**
			     * @param {string|HTMLElement} element
			     * @param {string} methodName
			     * @param {...ArbitraryValue} args
			     * @returns {ArbitraryValue}
			     */
			    invoke(element, methodName, ...args) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      return this.get(elem)[methodName](elem, ...args);
			    }
			  }

			  /**
			   * Element-aware wrapper for `WeakMap`.
			   * @extends {WeakMap<any>}
			   */
			  class JamilihWeakMap extends WeakMap {
			    /**
			     * @param {HTMLElement} element
			     * @returns {ArbitraryValue}
			     */
			    get(element) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      if (!elem) {
			        throw new Error("Can't find the element");
			      }
			      return super.get.call(this, elem);
			    }
			    /**
			     * @param {HTMLElement} element
			     * @param {ArbitraryValue} value
			     * @returns {ArbitraryValue}
			     */
			    set(element, value) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      if (!elem) {
			        throw new Error("Can't find the element");
			      }
			      return super.set.call(this, elem, value);
			    }
			    /**
			     * @param {string|HTMLElement} element
			     * @param {string} methodName
			     * @param {...ArbitraryValue} args
			     * @returns {ArbitraryValue}
			     */
			    invoke(element, methodName, ...args) {
			      const elem = typeof element === 'string' ? $(element) : element;
			      if (!elem) {
			        throw new Error("Can't find the element");
			      }
			      return this.get(elem)[methodName](elem, ...args);
			    }
			  }
			  jml.Map = JamilihMap;
			  jml.WeakMap = JamilihWeakMap;

			  /**
			   * @typedef {[JamilihWeakMap|JamilihMap, HTMLElement]} MapAndElementArray
			   */

			  /**
			   * @param {{[key: string]: any}} obj
			   * @param {JamilihArrayPostOptions} args
			   * @returns {MapAndElementArray}
			   */
			  jml.weak = function (obj, ...args) {
			    const map = new JamilihWeakMap();
			    const elem = jml({
			      $map: [map, obj]
			    }, ...args);
			    return [map, (/** @type {HTMLElement} */elem)];
			  };

			  /**
			   * @param {ArbitraryValue} obj
			   * @param {JamilihArrayPostOptions} args
			   * @returns {MapAndElementArray}
			   */
			  jml.strong = function (obj, ...args) {
			    const map = new JamilihMap();
			    const elem = jml({
			      $map: [map, obj]
			    }, ...args);
			    return [map, (/** @type {HTMLElement} */elem)];
			  };

			  /**
			   * @param {string|HTMLElement} element If a string, will be interpreted as a selector
			   * @param {symbol|string} sym If a string, will be used with `Symbol.for`
			   * @returns {ArbitraryValue} The value associated with the symbol
			   */
			  jml.symbol = jml.sym = jml.for = function (element, sym) {
			    const elem = typeof element === 'string' ? $(element) : element;

			    // @ts-expect-error Should be ok
			    return elem[typeof sym === 'symbol' ? sym : Symbol.for(sym)];
			  };

			  /**
			   * @typedef {((elem: HTMLElement, ...args: any[]) => void)|{[key: string]: (elem: HTMLElement, ...args: any[]) => void}} MapCommand
			   */

			  /**
			   * @param {?(string|HTMLElement)} elem If a string, will be interpreted as a selector
			   * @param {symbol|string|Map<HTMLElement, MapCommand>|WeakMap<HTMLElement, MapCommand>} symOrMap If a string, will be used with `Symbol.for`
			   * @param {string|any} methodName Can be `any` if the symbol or map directly
			   *   points to a function (it is then used as the first argument).
			   * @param {ArbitraryValue[]} args
			   * @returns {ArbitraryValue}
			   */
			  jml.command = function (elem, symOrMap, methodName, ...args) {
			    elem = typeof elem === 'string' ? $(elem) : elem;
			    if (!elem) {
			      throw new Error('No element found');
			    }
			    let func;
			    if (['symbol', 'string'].includes(typeof symOrMap)) {
			      func = jml.sym(elem, /** @type {symbol|string} */symOrMap);
			      if (typeof func === 'function') {
			        return func(methodName, ...args); // Already has `this` bound to `elem`
			      }
			      return func[methodName](...args);
			    }
			    func = /** @type {Map<HTMLElement, MapCommand>|WeakMap<HTMLElement, MapCommand>} */symOrMap.get(elem);
			    if (!func) {
			      throw new Error('No map found');
			    }
			    if (typeof func === 'function') {
			      return func.call(elem, methodName, ...args);
			    }
			    return func[methodName](elem, ...args);
			    // return func[methodName].call(elem, ...args);
			  };

			  /**
			   * Expects properties `document`, `XMLSerializer`, and `DOMParser`.
			   * Also updates `body` with `document.body`.
			   * @param {import('jsdom').DOMWindow|HTMLWindow|typeof globalThis|undefined} wind
			   * @returns {void}
			   */
			  jml.setWindow = wind => {
			    win = wind;
			    doc = win?.document;
			    if (doc && doc.body) {
			      // eslint-disable-next-line prefer-destructuring -- Needed for typing
			      exports$1.body = /** @type {HTMLBodyElement} */doc.body;
			    }
			  };

			  /**
			   * @returns {import('jsdom').DOMWindow|HTMLWindow|typeof globalThis}
			   */
			  jml.getWindow = () => {
			    if (!win) {
			      throw new Error('No window object set');
			    }
			    return win;
			  };

			  /**
			   * Does not run Jamilih so can be further processed.
			   * @param {ArbitraryValue[]} array
			   * @param {ArbitraryValue} glu
			   * @returns {ArbitraryValue[]}
			   */
			  function glue(array, glu) {
			    return [...array].reduce((arr, item) => {
			      arr.push(item, glu);
			      return arr;
			    }, []).slice(0, -1);
			  }

			  /**
			   * @type {HTMLBodyElement}
			   */
			  exports$1.body = void 0; // // eslint-disable-line import/no-mutable-exports

			  /* c8 ignore next 4 */
			  if (doc && doc.body) {
			    // eslint-disable-next-line prefer-destructuring -- Needed for type
			    exports$1.body = /** @type {HTMLBodyElement} */doc.body;
			  }
			  const nbsp = '\u00A0'; // Very commonly needed in templates

			  exports$1.$ = $;
			  exports$1.$$ = $$;
			  exports$1.DOMException = DOMException;
			  exports$1.default = jml;
			  exports$1.glue = glue;
			  exports$1.jml = jml;
			  exports$1.nbsp = nbsp;

			  Object.defineProperty(exports$1, '__esModule', { value: true });

			})); 
		} (jml$1, jml$1.exports));
		return jml$1.exports;
	}

	var jmlExports = requireJml();

	var jquery$1 = {exports: {}};

	/*!
	 * jQuery JavaScript Library v3.7.1
	 * https://jquery.com/
	 *
	 * Copyright OpenJS Foundation and other contributors
	 * Released under the MIT license
	 * https://jquery.org/license
	 *
	 * Date: 2023-08-28T13:37Z
	 */
	var jquery = jquery$1.exports;

	var hasRequiredJquery;

	function requireJquery () {
		if (hasRequiredJquery) return jquery$1.exports;
		hasRequiredJquery = 1;
		(function (module) {
			( function( global, factory ) {

				{

					// For CommonJS and CommonJS-like environments where a proper `window`
					// is present, execute the factory and get jQuery.
					// For environments that do not have a `window` with a `document`
					// (such as Node.js), expose a factory as module.exports.
					// This accentuates the need for the creation of a real `window`.
					// e.g. var jQuery = require("jquery")(window);
					// See ticket trac-14549 for more info.
					module.exports = global.document ?
						factory( global, true ) :
						function( w ) {
							if ( !w.document ) {
								throw new Error( "jQuery requires a window with a document" );
							}
							return factory( w );
						};
				}

			// Pass this if window is not defined yet
			} )( typeof window !== "undefined" ? window : jquery, function( window, noGlobal ) {

			var arr = [];

			var getProto = Object.getPrototypeOf;

			var slice = arr.slice;

			var flat = arr.flat ? function( array ) {
				return arr.flat.call( array );
			} : function( array ) {
				return arr.concat.apply( [], array );
			};


			var push = arr.push;

			var indexOf = arr.indexOf;

			var class2type = {};

			var toString = class2type.toString;

			var hasOwn = class2type.hasOwnProperty;

			var fnToString = hasOwn.toString;

			var ObjectFunctionString = fnToString.call( Object );

			var support = {};

			var isFunction = function isFunction( obj ) {

					// Support: Chrome <=57, Firefox <=52
					// In some browsers, typeof returns "function" for HTML <object> elements
					// (i.e., `typeof document.createElement( "object" ) === "function"`).
					// We don't want to classify *any* DOM node as a function.
					// Support: QtWeb <=3.8.5, WebKit <=534.34, wkhtmltopdf tool <=0.12.5
					// Plus for old WebKit, typeof returns "function" for HTML collections
					// (e.g., `typeof document.getElementsByTagName("div") === "function"`). (gh-4756)
					return typeof obj === "function" && typeof obj.nodeType !== "number" &&
						typeof obj.item !== "function";
				};


			var isWindow = function isWindow( obj ) {
					return obj != null && obj === obj.window;
				};


			var document = window.document;



				var preservedScriptAttributes = {
					type: true,
					src: true,
					nonce: true,
					noModule: true
				};

				function DOMEval( code, node, doc ) {
					doc = doc || document;

					var i, val,
						script = doc.createElement( "script" );

					script.text = code;
					if ( node ) {
						for ( i in preservedScriptAttributes ) {

							// Support: Firefox 64+, Edge 18+
							// Some browsers don't support the "nonce" property on scripts.
							// On the other hand, just using `getAttribute` is not enough as
							// the `nonce` attribute is reset to an empty string whenever it
							// becomes browsing-context connected.
							// See https://github.com/whatwg/html/issues/2369
							// See https://html.spec.whatwg.org/#nonce-attributes
							// The `node.getAttribute` check was added for the sake of
							// `jQuery.globalEval` so that it can fake a nonce-containing node
							// via an object.
							val = node[ i ] || node.getAttribute && node.getAttribute( i );
							if ( val ) {
								script.setAttribute( i, val );
							}
						}
					}
					doc.head.appendChild( script ).parentNode.removeChild( script );
				}


			function toType( obj ) {
				if ( obj == null ) {
					return obj + "";
				}

				// Support: Android <=2.3 only (functionish RegExp)
				return typeof obj === "object" || typeof obj === "function" ?
					class2type[ toString.call( obj ) ] || "object" :
					typeof obj;
			}
			/* global Symbol */
			// Defining this global in .eslintrc.json would create a danger of using the global
			// unguarded in another place, it seems safer to define global only for this module



			var version = "3.7.1",

				rhtmlSuffix = /HTML$/i,

				// Define a local copy of jQuery
				jQuery = function( selector, context ) {

					// The jQuery object is actually just the init constructor 'enhanced'
					// Need init if jQuery is called (just allow error to be thrown if not included)
					return new jQuery.fn.init( selector, context );
				};

			jQuery.fn = jQuery.prototype = {

				// The current version of jQuery being used
				jquery: version,

				constructor: jQuery,

				// The default length of a jQuery object is 0
				length: 0,

				toArray: function() {
					return slice.call( this );
				},

				// Get the Nth element in the matched element set OR
				// Get the whole matched element set as a clean array
				get: function( num ) {

					// Return all the elements in a clean array
					if ( num == null ) {
						return slice.call( this );
					}

					// Return just the one element from the set
					return num < 0 ? this[ num + this.length ] : this[ num ];
				},

				// Take an array of elements and push it onto the stack
				// (returning the new matched element set)
				pushStack: function( elems ) {

					// Build a new jQuery matched element set
					var ret = jQuery.merge( this.constructor(), elems );

					// Add the old object onto the stack (as a reference)
					ret.prevObject = this;

					// Return the newly-formed element set
					return ret;
				},

				// Execute a callback for every element in the matched set.
				each: function( callback ) {
					return jQuery.each( this, callback );
				},

				map: function( callback ) {
					return this.pushStack( jQuery.map( this, function( elem, i ) {
						return callback.call( elem, i, elem );
					} ) );
				},

				slice: function() {
					return this.pushStack( slice.apply( this, arguments ) );
				},

				first: function() {
					return this.eq( 0 );
				},

				last: function() {
					return this.eq( -1 );
				},

				even: function() {
					return this.pushStack( jQuery.grep( this, function( _elem, i ) {
						return ( i + 1 ) % 2;
					} ) );
				},

				odd: function() {
					return this.pushStack( jQuery.grep( this, function( _elem, i ) {
						return i % 2;
					} ) );
				},

				eq: function( i ) {
					var len = this.length,
						j = +i + ( i < 0 ? len : 0 );
					return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
				},

				end: function() {
					return this.prevObject || this.constructor();
				},

				// For internal use only.
				// Behaves like an Array's method, not like a jQuery method.
				push: push,
				sort: arr.sort,
				splice: arr.splice
			};

			jQuery.extend = jQuery.fn.extend = function() {
				var options, name, src, copy, copyIsArray, clone,
					target = arguments[ 0 ] || {},
					i = 1,
					length = arguments.length,
					deep = false;

				// Handle a deep copy situation
				if ( typeof target === "boolean" ) {
					deep = target;

					// Skip the boolean and the target
					target = arguments[ i ] || {};
					i++;
				}

				// Handle case when target is a string or something (possible in deep copy)
				if ( typeof target !== "object" && !isFunction( target ) ) {
					target = {};
				}

				// Extend jQuery itself if only one argument is passed
				if ( i === length ) {
					target = this;
					i--;
				}

				for ( ; i < length; i++ ) {

					// Only deal with non-null/undefined values
					if ( ( options = arguments[ i ] ) != null ) {

						// Extend the base object
						for ( name in options ) {
							copy = options[ name ];

							// Prevent Object.prototype pollution
							// Prevent never-ending loop
							if ( name === "__proto__" || target === copy ) {
								continue;
							}

							// Recurse if we're merging plain objects or arrays
							if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
								( copyIsArray = Array.isArray( copy ) ) ) ) {
								src = target[ name ];

								// Ensure proper type for the source value
								if ( copyIsArray && !Array.isArray( src ) ) {
									clone = [];
								} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
									clone = {};
								} else {
									clone = src;
								}
								copyIsArray = false;

								// Never move original objects, clone them
								target[ name ] = jQuery.extend( deep, clone, copy );

							// Don't bring in undefined values
							} else if ( copy !== undefined ) {
								target[ name ] = copy;
							}
						}
					}
				}

				// Return the modified object
				return target;
			};

			jQuery.extend( {

				// Unique for each copy of jQuery on the page
				expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

				// Assume jQuery is ready without the ready module
				isReady: true,

				error: function( msg ) {
					throw new Error( msg );
				},

				noop: function() {},

				isPlainObject: function( obj ) {
					var proto, Ctor;

					// Detect obvious negatives
					// Use toString instead of jQuery.type to catch host objects
					if ( !obj || toString.call( obj ) !== "[object Object]" ) {
						return false;
					}

					proto = getProto( obj );

					// Objects with no prototype (e.g., `Object.create( null )`) are plain
					if ( !proto ) {
						return true;
					}

					// Objects with prototype are plain iff they were constructed by a global Object function
					Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
					return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
				},

				isEmptyObject: function( obj ) {
					var name;

					for ( name in obj ) {
						return false;
					}
					return true;
				},

				// Evaluates a script in a provided context; falls back to the global one
				// if not specified.
				globalEval: function( code, options, doc ) {
					DOMEval( code, { nonce: options && options.nonce }, doc );
				},

				each: function( obj, callback ) {
					var length, i = 0;

					if ( isArrayLike( obj ) ) {
						length = obj.length;
						for ( ; i < length; i++ ) {
							if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
								break;
							}
						}
					} else {
						for ( i in obj ) {
							if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
								break;
							}
						}
					}

					return obj;
				},


				// Retrieve the text value of an array of DOM nodes
				text: function( elem ) {
					var node,
						ret = "",
						i = 0,
						nodeType = elem.nodeType;

					if ( !nodeType ) {

						// If no nodeType, this is expected to be an array
						while ( ( node = elem[ i++ ] ) ) {

							// Do not traverse comment nodes
							ret += jQuery.text( node );
						}
					}
					if ( nodeType === 1 || nodeType === 11 ) {
						return elem.textContent;
					}
					if ( nodeType === 9 ) {
						return elem.documentElement.textContent;
					}
					if ( nodeType === 3 || nodeType === 4 ) {
						return elem.nodeValue;
					}

					// Do not include comment or processing instruction nodes

					return ret;
				},

				// results is for internal usage only
				makeArray: function( arr, results ) {
					var ret = results || [];

					if ( arr != null ) {
						if ( isArrayLike( Object( arr ) ) ) {
							jQuery.merge( ret,
								typeof arr === "string" ?
									[ arr ] : arr
							);
						} else {
							push.call( ret, arr );
						}
					}

					return ret;
				},

				inArray: function( elem, arr, i ) {
					return arr == null ? -1 : indexOf.call( arr, elem, i );
				},

				isXMLDoc: function( elem ) {
					var namespace = elem && elem.namespaceURI,
						docElem = elem && ( elem.ownerDocument || elem ).documentElement;

					// Assume HTML when documentElement doesn't yet exist, such as inside
					// document fragments.
					return !rhtmlSuffix.test( namespace || docElem && docElem.nodeName || "HTML" );
				},

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				merge: function( first, second ) {
					var len = +second.length,
						j = 0,
						i = first.length;

					for ( ; j < len; j++ ) {
						first[ i++ ] = second[ j ];
					}

					first.length = i;

					return first;
				},

				grep: function( elems, callback, invert ) {
					var callbackInverse,
						matches = [],
						i = 0,
						length = elems.length,
						callbackExpect = !invert;

					// Go through the array, only saving the items
					// that pass the validator function
					for ( ; i < length; i++ ) {
						callbackInverse = !callback( elems[ i ], i );
						if ( callbackInverse !== callbackExpect ) {
							matches.push( elems[ i ] );
						}
					}

					return matches;
				},

				// arg is for internal usage only
				map: function( elems, callback, arg ) {
					var length, value,
						i = 0,
						ret = [];

					// Go through the array, translating each of the items to their new values
					if ( isArrayLike( elems ) ) {
						length = elems.length;
						for ( ; i < length; i++ ) {
							value = callback( elems[ i ], i, arg );

							if ( value != null ) {
								ret.push( value );
							}
						}

					// Go through every key on the object,
					} else {
						for ( i in elems ) {
							value = callback( elems[ i ], i, arg );

							if ( value != null ) {
								ret.push( value );
							}
						}
					}

					// Flatten any nested arrays
					return flat( ret );
				},

				// A global GUID counter for objects
				guid: 1,

				// jQuery.support is not used in Core but other projects attach their
				// properties to it so it needs to exist.
				support: support
			} );

			if ( typeof Symbol === "function" ) {
				jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
			}

			// Populate the class2type map
			jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
				function( _i, name ) {
					class2type[ "[object " + name + "]" ] = name.toLowerCase();
				} );

			function isArrayLike( obj ) {

				// Support: real iOS 8.2 only (not reproducible in simulator)
				// `in` check used to prevent JIT error (gh-2145)
				// hasOwn isn't used here due to false negatives
				// regarding Nodelist length in IE
				var length = !!obj && "length" in obj && obj.length,
					type = toType( obj );

				if ( isFunction( obj ) || isWindow( obj ) ) {
					return false;
				}

				return type === "array" || length === 0 ||
					typeof length === "number" && length > 0 && ( length - 1 ) in obj;
			}


			function nodeName( elem, name ) {

				return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

			}
			var pop = arr.pop;


			var sort = arr.sort;


			var splice = arr.splice;


			var whitespace = "[\\x20\\t\\r\\n\\f]";


			var rtrimCSS = new RegExp(
				"^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$",
				"g"
			);




			// Note: an element does not contain itself
			jQuery.contains = function( a, b ) {
				var bup = b && b.parentNode;

				return a === bup || !!( bup && bup.nodeType === 1 && (

					// Support: IE 9 - 11+
					// IE doesn't have `contains` on SVG.
					a.contains ?
						a.contains( bup ) :
						a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
				) );
			};




			// CSS string/identifier serialization
			// https://drafts.csswg.org/cssom/#common-serializing-idioms
			var rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;

			function fcssescape( ch, asCodePoint ) {
				if ( asCodePoint ) {

					// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
					if ( ch === "\0" ) {
						return "\uFFFD";
					}

					// Control characters and (dependent upon position) numbers get escaped as code points
					return ch.slice( 0, -1 ) + "\\" + ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
				}

				// Other potentially-special ASCII characters get backslash-escaped
				return "\\" + ch;
			}

			jQuery.escapeSelector = function( sel ) {
				return ( sel + "" ).replace( rcssescape, fcssescape );
			};




			var preferredDoc = document,
				pushNative = push;

			( function() {

			var i,
				Expr,
				outermostContext,
				sortInput,
				hasDuplicate,
				push = pushNative,

				// Local document vars
				document,
				documentElement,
				documentIsHTML,
				rbuggyQSA,
				matches,

				// Instance-specific data
				expando = jQuery.expando,
				dirruns = 0,
				done = 0,
				classCache = createCache(),
				tokenCache = createCache(),
				compilerCache = createCache(),
				nonnativeSelectorCache = createCache(),
				sortOrder = function( a, b ) {
					if ( a === b ) {
						hasDuplicate = true;
					}
					return 0;
				},

				booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|" +
					"loop|multiple|open|readonly|required|scoped",

				// Regular expressions

				// https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
				identifier = "(?:\\\\[\\da-fA-F]{1,6}" + whitespace +
					"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",

				// Attribute selectors: https://www.w3.org/TR/selectors/#attribute-selectors
				attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +

					// Operator (capture 2)
					"*([*^$|!~]?=)" + whitespace +

					// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
					"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" +
					whitespace + "*\\]",

				pseudos = ":(" + identifier + ")(?:\\((" +

					// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
					// 1. quoted (capture 3; capture 4 or capture 5)
					"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +

					// 2. simple (capture 6)
					"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +

					// 3. anything else (capture 2)
					".*" +
					")\\)|)",

				// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
				rwhitespace = new RegExp( whitespace + "+", "g" ),

				rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
				rleadingCombinator = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" +
					whitespace + "*" ),
				rdescend = new RegExp( whitespace + "|>" ),

				rpseudo = new RegExp( pseudos ),
				ridentifier = new RegExp( "^" + identifier + "$" ),

				matchExpr = {
					ID: new RegExp( "^#(" + identifier + ")" ),
					CLASS: new RegExp( "^\\.(" + identifier + ")" ),
					TAG: new RegExp( "^(" + identifier + "|[*])" ),
					ATTR: new RegExp( "^" + attributes ),
					PSEUDO: new RegExp( "^" + pseudos ),
					CHILD: new RegExp(
						"^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
							whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" +
							whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
					bool: new RegExp( "^(?:" + booleans + ")$", "i" ),

					// For use in libraries implementing .is()
					// We use this for POS matching in `select`
					needsContext: new RegExp( "^" + whitespace +
						"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
						"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
				},

				rinputs = /^(?:input|select|textarea|button)$/i,
				rheader = /^h\d$/i,

				// Easily-parseable/retrievable ID or TAG or CLASS selectors
				rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

				rsibling = /[+~]/,

				// CSS escapes
				// https://www.w3.org/TR/CSS21/syndata.html#escaped-characters
				runescape = new RegExp( "\\\\[\\da-fA-F]{1,6}" + whitespace +
					"?|\\\\([^\\r\\n\\f])", "g" ),
				funescape = function( escape, nonHex ) {
					var high = "0x" + escape.slice( 1 ) - 0x10000;

					if ( nonHex ) {

						// Strip the backslash prefix from a non-hex escape sequence
						return nonHex;
					}

					// Replace a hexadecimal escape sequence with the encoded Unicode code point
					// Support: IE <=11+
					// For values outside the Basic Multilingual Plane (BMP), manually construct a
					// surrogate pair
					return high < 0 ?
						String.fromCharCode( high + 0x10000 ) :
						String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
				},

				// Used for iframes; see `setDocument`.
				// Support: IE 9 - 11+, Edge 12 - 18+
				// Removing the function wrapper causes a "Permission Denied"
				// error in IE/Edge.
				unloadHandler = function() {
					setDocument();
				},

				inDisabledFieldset = addCombinator(
					function( elem ) {
						return elem.disabled === true && nodeName( elem, "fieldset" );
					},
					{ dir: "parentNode", next: "legend" }
				);

			// Support: IE <=9 only
			// Accessing document.activeElement can throw unexpectedly
			// https://bugs.jquery.com/ticket/13393
			function safeActiveElement() {
				try {
					return document.activeElement;
				} catch ( err ) { }
			}

			// Optimize for push.apply( _, NodeList )
			try {
				push.apply(
					( arr = slice.call( preferredDoc.childNodes ) ),
					preferredDoc.childNodes
				);

				// Support: Android <=4.0
				// Detect silently failing push.apply
				// eslint-disable-next-line no-unused-expressions
				arr[ preferredDoc.childNodes.length ].nodeType;
			} catch ( e ) {
				push = {
					apply: function( target, els ) {
						pushNative.apply( target, slice.call( els ) );
					},
					call: function( target ) {
						pushNative.apply( target, slice.call( arguments, 1 ) );
					}
				};
			}

			function find( selector, context, results, seed ) {
				var m, i, elem, nid, match, groups, newSelector,
					newContext = context && context.ownerDocument,

					// nodeType defaults to 9, since context defaults to document
					nodeType = context ? context.nodeType : 9;

				results = results || [];

				// Return early from calls with invalid selector or context
				if ( typeof selector !== "string" || !selector ||
					nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

					return results;
				}

				// Try to shortcut find operations (as opposed to filters) in HTML documents
				if ( !seed ) {
					setDocument( context );
					context = context || document;

					if ( documentIsHTML ) {

						// If the selector is sufficiently simple, try using a "get*By*" DOM method
						// (excepting DocumentFragment context, where the methods don't exist)
						if ( nodeType !== 11 && ( match = rquickExpr.exec( selector ) ) ) {

							// ID selector
							if ( ( m = match[ 1 ] ) ) {

								// Document context
								if ( nodeType === 9 ) {
									if ( ( elem = context.getElementById( m ) ) ) {

										// Support: IE 9 only
										// getElementById can match elements by name instead of ID
										if ( elem.id === m ) {
											push.call( results, elem );
											return results;
										}
									} else {
										return results;
									}

								// Element context
								} else {

									// Support: IE 9 only
									// getElementById can match elements by name instead of ID
									if ( newContext && ( elem = newContext.getElementById( m ) ) &&
										find.contains( context, elem ) &&
										elem.id === m ) {

										push.call( results, elem );
										return results;
									}
								}

							// Type selector
							} else if ( match[ 2 ] ) {
								push.apply( results, context.getElementsByTagName( selector ) );
								return results;

							// Class selector
							} else if ( ( m = match[ 3 ] ) && context.getElementsByClassName ) {
								push.apply( results, context.getElementsByClassName( m ) );
								return results;
							}
						}

						// Take advantage of querySelectorAll
						if ( !nonnativeSelectorCache[ selector + " " ] &&
							( !rbuggyQSA || !rbuggyQSA.test( selector ) ) ) {

							newSelector = selector;
							newContext = context;

							// qSA considers elements outside a scoping root when evaluating child or
							// descendant combinators, which is not what we want.
							// In such cases, we work around the behavior by prefixing every selector in the
							// list with an ID selector referencing the scope context.
							// The technique has to be used as well when a leading combinator is used
							// as such selectors are not recognized by querySelectorAll.
							// Thanks to Andrew Dupont for this technique.
							if ( nodeType === 1 &&
								( rdescend.test( selector ) || rleadingCombinator.test( selector ) ) ) {

								// Expand context for sibling selectors
								newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
									context;

								// We can use :scope instead of the ID hack if the browser
								// supports it & if we're not changing the context.
								// Support: IE 11+, Edge 17 - 18+
								// IE/Edge sometimes throw a "Permission denied" error when
								// strict-comparing two documents; shallow comparisons work.
								// eslint-disable-next-line eqeqeq
								if ( newContext != context || !support.scope ) {

									// Capture the context ID, setting it first if necessary
									if ( ( nid = context.getAttribute( "id" ) ) ) {
										nid = jQuery.escapeSelector( nid );
									} else {
										context.setAttribute( "id", ( nid = expando ) );
									}
								}

								// Prefix every selector in the list
								groups = tokenize( selector );
								i = groups.length;
								while ( i-- ) {
									groups[ i ] = ( nid ? "#" + nid : ":scope" ) + " " +
										toSelector( groups[ i ] );
								}
								newSelector = groups.join( "," );
							}

							try {
								push.apply( results,
									newContext.querySelectorAll( newSelector )
								);
								return results;
							} catch ( qsaError ) {
								nonnativeSelectorCache( selector, true );
							} finally {
								if ( nid === expando ) {
									context.removeAttribute( "id" );
								}
							}
						}
					}
				}

				// All others
				return select( selector.replace( rtrimCSS, "$1" ), context, results, seed );
			}

			/**
			 * Create key-value caches of limited size
			 * @returns {function(string, object)} Returns the Object data after storing it on itself with
			 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
			 *	deleting the oldest entry
			 */
			function createCache() {
				var keys = [];

				function cache( key, value ) {

					// Use (key + " ") to avoid collision with native prototype properties
					// (see https://github.com/jquery/sizzle/issues/157)
					if ( keys.push( key + " " ) > Expr.cacheLength ) {

						// Only keep the most recent entries
						delete cache[ keys.shift() ];
					}
					return ( cache[ key + " " ] = value );
				}
				return cache;
			}

			/**
			 * Mark a function for special use by jQuery selector module
			 * @param {Function} fn The function to mark
			 */
			function markFunction( fn ) {
				fn[ expando ] = true;
				return fn;
			}

			/**
			 * Support testing using an element
			 * @param {Function} fn Passed the created element and returns a boolean result
			 */
			function assert( fn ) {
				var el = document.createElement( "fieldset" );

				try {
					return !!fn( el );
				} catch ( e ) {
					return false;
				} finally {

					// Remove from its parent by default
					if ( el.parentNode ) {
						el.parentNode.removeChild( el );
					}

					// release memory in IE
					el = null;
				}
			}

			/**
			 * Returns a function to use in pseudos for input types
			 * @param {String} type
			 */
			function createInputPseudo( type ) {
				return function( elem ) {
					return nodeName( elem, "input" ) && elem.type === type;
				};
			}

			/**
			 * Returns a function to use in pseudos for buttons
			 * @param {String} type
			 */
			function createButtonPseudo( type ) {
				return function( elem ) {
					return ( nodeName( elem, "input" ) || nodeName( elem, "button" ) ) &&
						elem.type === type;
				};
			}

			/**
			 * Returns a function to use in pseudos for :enabled/:disabled
			 * @param {Boolean} disabled true for :disabled; false for :enabled
			 */
			function createDisabledPseudo( disabled ) {

				// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
				return function( elem ) {

					// Only certain elements can match :enabled or :disabled
					// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
					// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
					if ( "form" in elem ) {

						// Check for inherited disabledness on relevant non-disabled elements:
						// * listed form-associated elements in a disabled fieldset
						//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
						//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
						// * option elements in a disabled optgroup
						//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
						// All such elements have a "form" property.
						if ( elem.parentNode && elem.disabled === false ) {

							// Option elements defer to a parent optgroup if present
							if ( "label" in elem ) {
								if ( "label" in elem.parentNode ) {
									return elem.parentNode.disabled === disabled;
								} else {
									return elem.disabled === disabled;
								}
							}

							// Support: IE 6 - 11+
							// Use the isDisabled shortcut property to check for disabled fieldset ancestors
							return elem.isDisabled === disabled ||

								// Where there is no isDisabled, check manually
								elem.isDisabled !== !disabled &&
									inDisabledFieldset( elem ) === disabled;
						}

						return elem.disabled === disabled;

					// Try to winnow out elements that can't be disabled before trusting the disabled property.
					// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
					// even exist on them, let alone have a boolean value.
					} else if ( "label" in elem ) {
						return elem.disabled === disabled;
					}

					// Remaining elements are neither :enabled nor :disabled
					return false;
				};
			}

			/**
			 * Returns a function to use in pseudos for positionals
			 * @param {Function} fn
			 */
			function createPositionalPseudo( fn ) {
				return markFunction( function( argument ) {
					argument = +argument;
					return markFunction( function( seed, matches ) {
						var j,
							matchIndexes = fn( [], seed.length, argument ),
							i = matchIndexes.length;

						// Match elements found at the specified indexes
						while ( i-- ) {
							if ( seed[ ( j = matchIndexes[ i ] ) ] ) {
								seed[ j ] = !( matches[ j ] = seed[ j ] );
							}
						}
					} );
				} );
			}

			/**
			 * Checks a node for validity as a jQuery selector context
			 * @param {Element|Object=} context
			 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
			 */
			function testContext( context ) {
				return context && typeof context.getElementsByTagName !== "undefined" && context;
			}

			/**
			 * Sets document-related variables once based on the current document
			 * @param {Element|Object} [node] An element or document object to use to set the document
			 * @returns {Object} Returns the current document
			 */
			function setDocument( node ) {
				var subWindow,
					doc = node ? node.ownerDocument || node : preferredDoc;

				// Return early if doc is invalid or already selected
				// Support: IE 11+, Edge 17 - 18+
				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				if ( doc == document || doc.nodeType !== 9 || !doc.documentElement ) {
					return document;
				}

				// Update global variables
				document = doc;
				documentElement = document.documentElement;
				documentIsHTML = !jQuery.isXMLDoc( document );

				// Support: iOS 7 only, IE 9 - 11+
				// Older browsers didn't support unprefixed `matches`.
				matches = documentElement.matches ||
					documentElement.webkitMatchesSelector ||
					documentElement.msMatchesSelector;

				// Support: IE 9 - 11+, Edge 12 - 18+
				// Accessing iframe documents after unload throws "permission denied" errors
				// (see trac-13936).
				// Limit the fix to IE & Edge Legacy; despite Edge 15+ implementing `matches`,
				// all IE 9+ and Edge Legacy versions implement `msMatchesSelector` as well.
				if ( documentElement.msMatchesSelector &&

					// Support: IE 11+, Edge 17 - 18+
					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					preferredDoc != document &&
					( subWindow = document.defaultView ) && subWindow.top !== subWindow ) {

					// Support: IE 9 - 11+, Edge 12 - 18+
					subWindow.addEventListener( "unload", unloadHandler );
				}

				// Support: IE <10
				// Check if getElementById returns elements by name
				// The broken getElementById methods don't pick up programmatically-set names,
				// so use a roundabout getElementsByName test
				support.getById = assert( function( el ) {
					documentElement.appendChild( el ).id = jQuery.expando;
					return !document.getElementsByName ||
						!document.getElementsByName( jQuery.expando ).length;
				} );

				// Support: IE 9 only
				// Check to see if it's possible to do matchesSelector
				// on a disconnected node.
				support.disconnectedMatch = assert( function( el ) {
					return matches.call( el, "*" );
				} );

				// Support: IE 9 - 11+, Edge 12 - 18+
				// IE/Edge don't support the :scope pseudo-class.
				support.scope = assert( function() {
					return document.querySelectorAll( ":scope" );
				} );

				// Support: Chrome 105 - 111 only, Safari 15.4 - 16.3 only
				// Make sure the `:has()` argument is parsed unforgivingly.
				// We include `*` in the test to detect buggy implementations that are
				// _selectively_ forgiving (specifically when the list includes at least
				// one valid selector).
				// Note that we treat complete lack of support for `:has()` as if it were
				// spec-compliant support, which is fine because use of `:has()` in such
				// environments will fail in the qSA path and fall back to jQuery traversal
				// anyway.
				support.cssHas = assert( function() {
					try {
						document.querySelector( ":has(*,:jqfake)" );
						return false;
					} catch ( e ) {
						return true;
					}
				} );

				// ID filter and find
				if ( support.getById ) {
					Expr.filter.ID = function( id ) {
						var attrId = id.replace( runescape, funescape );
						return function( elem ) {
							return elem.getAttribute( "id" ) === attrId;
						};
					};
					Expr.find.ID = function( id, context ) {
						if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
							var elem = context.getElementById( id );
							return elem ? [ elem ] : [];
						}
					};
				} else {
					Expr.filter.ID =  function( id ) {
						var attrId = id.replace( runescape, funescape );
						return function( elem ) {
							var node = typeof elem.getAttributeNode !== "undefined" &&
								elem.getAttributeNode( "id" );
							return node && node.value === attrId;
						};
					};

					// Support: IE 6 - 7 only
					// getElementById is not reliable as a find shortcut
					Expr.find.ID = function( id, context ) {
						if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
							var node, i, elems,
								elem = context.getElementById( id );

							if ( elem ) {

								// Verify the id attribute
								node = elem.getAttributeNode( "id" );
								if ( node && node.value === id ) {
									return [ elem ];
								}

								// Fall back on getElementsByName
								elems = context.getElementsByName( id );
								i = 0;
								while ( ( elem = elems[ i++ ] ) ) {
									node = elem.getAttributeNode( "id" );
									if ( node && node.value === id ) {
										return [ elem ];
									}
								}
							}

							return [];
						}
					};
				}

				// Tag
				Expr.find.TAG = function( tag, context ) {
					if ( typeof context.getElementsByTagName !== "undefined" ) {
						return context.getElementsByTagName( tag );

					// DocumentFragment nodes don't have gEBTN
					} else {
						return context.querySelectorAll( tag );
					}
				};

				// Class
				Expr.find.CLASS = function( className, context ) {
					if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
						return context.getElementsByClassName( className );
					}
				};

				/* QSA/matchesSelector
				---------------------------------------------------------------------- */

				// QSA and matchesSelector support

				rbuggyQSA = [];

				// Build QSA regex
				// Regex strategy adopted from Diego Perini
				assert( function( el ) {

					var input;

					documentElement.appendChild( el ).innerHTML =
						"<a id='" + expando + "' href='' disabled='disabled'></a>" +
						"<select id='" + expando + "-\r\\' disabled='disabled'>" +
						"<option selected=''></option></select>";

					// Support: iOS <=7 - 8 only
					// Boolean attributes and "value" are not treated correctly in some XML documents
					if ( !el.querySelectorAll( "[selected]" ).length ) {
						rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
					}

					// Support: iOS <=7 - 8 only
					if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
						rbuggyQSA.push( "~=" );
					}

					// Support: iOS 8 only
					// https://bugs.webkit.org/show_bug.cgi?id=136851
					// In-page `selector#id sibling-combinator selector` fails
					if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
						rbuggyQSA.push( ".#.+[+~]" );
					}

					// Support: Chrome <=105+, Firefox <=104+, Safari <=15.4+
					// In some of the document kinds, these selectors wouldn't work natively.
					// This is probably OK but for backwards compatibility we want to maintain
					// handling them through jQuery traversal in jQuery 3.x.
					if ( !el.querySelectorAll( ":checked" ).length ) {
						rbuggyQSA.push( ":checked" );
					}

					// Support: Windows 8 Native Apps
					// The type and name attributes are restricted during .innerHTML assignment
					input = document.createElement( "input" );
					input.setAttribute( "type", "hidden" );
					el.appendChild( input ).setAttribute( "name", "D" );

					// Support: IE 9 - 11+
					// IE's :disabled selector does not pick up the children of disabled fieldsets
					// Support: Chrome <=105+, Firefox <=104+, Safari <=15.4+
					// In some of the document kinds, these selectors wouldn't work natively.
					// This is probably OK but for backwards compatibility we want to maintain
					// handling them through jQuery traversal in jQuery 3.x.
					documentElement.appendChild( el ).disabled = true;
					if ( el.querySelectorAll( ":disabled" ).length !== 2 ) {
						rbuggyQSA.push( ":enabled", ":disabled" );
					}

					// Support: IE 11+, Edge 15 - 18+
					// IE 11/Edge don't find elements on a `[name='']` query in some cases.
					// Adding a temporary attribute to the document before the selection works
					// around the issue.
					// Interestingly, IE 10 & older don't seem to have the issue.
					input = document.createElement( "input" );
					input.setAttribute( "name", "" );
					el.appendChild( input );
					if ( !el.querySelectorAll( "[name='']" ).length ) {
						rbuggyQSA.push( "\\[" + whitespace + "*name" + whitespace + "*=" +
							whitespace + "*(?:''|\"\")" );
					}
				} );

				if ( !support.cssHas ) {

					// Support: Chrome 105 - 110+, Safari 15.4 - 16.3+
					// Our regular `try-catch` mechanism fails to detect natively-unsupported
					// pseudo-classes inside `:has()` (such as `:has(:contains("Foo"))`)
					// in browsers that parse the `:has()` argument as a forgiving selector list.
					// https://drafts.csswg.org/selectors/#relational now requires the argument
					// to be parsed unforgivingly, but browsers have not yet fully adjusted.
					rbuggyQSA.push( ":has" );
				}

				rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join( "|" ) );

				/* Sorting
				---------------------------------------------------------------------- */

				// Document order sorting
				sortOrder = function( a, b ) {

					// Flag for duplicate removal
					if ( a === b ) {
						hasDuplicate = true;
						return 0;
					}

					// Sort on method existence if only one input has compareDocumentPosition
					var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
					if ( compare ) {
						return compare;
					}

					// Calculate position if both inputs belong to the same document
					// Support: IE 11+, Edge 17 - 18+
					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					compare = ( a.ownerDocument || a ) == ( b.ownerDocument || b ) ?
						a.compareDocumentPosition( b ) :

						// Otherwise we know they are disconnected
						1;

					// Disconnected nodes
					if ( compare & 1 ||
						( !support.sortDetached && b.compareDocumentPosition( a ) === compare ) ) {

						// Choose the first element that is related to our preferred document
						// Support: IE 11+, Edge 17 - 18+
						// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
						// two documents; shallow comparisons work.
						// eslint-disable-next-line eqeqeq
						if ( a === document || a.ownerDocument == preferredDoc &&
							find.contains( preferredDoc, a ) ) {
							return -1;
						}

						// Support: IE 11+, Edge 17 - 18+
						// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
						// two documents; shallow comparisons work.
						// eslint-disable-next-line eqeqeq
						if ( b === document || b.ownerDocument == preferredDoc &&
							find.contains( preferredDoc, b ) ) {
							return 1;
						}

						// Maintain original order
						return sortInput ?
							( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
							0;
					}

					return compare & 4 ? -1 : 1;
				};

				return document;
			}

			find.matches = function( expr, elements ) {
				return find( expr, null, null, elements );
			};

			find.matchesSelector = function( elem, expr ) {
				setDocument( elem );

				if ( documentIsHTML &&
					!nonnativeSelectorCache[ expr + " " ] &&
					( !rbuggyQSA || !rbuggyQSA.test( expr ) ) ) {

					try {
						var ret = matches.call( elem, expr );

						// IE 9's matchesSelector returns false on disconnected nodes
						if ( ret || support.disconnectedMatch ||

								// As well, disconnected nodes are said to be in a document
								// fragment in IE 9
								elem.document && elem.document.nodeType !== 11 ) {
							return ret;
						}
					} catch ( e ) {
						nonnativeSelectorCache( expr, true );
					}
				}

				return find( expr, document, null, [ elem ] ).length > 0;
			};

			find.contains = function( context, elem ) {

				// Set document vars if needed
				// Support: IE 11+, Edge 17 - 18+
				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				if ( ( context.ownerDocument || context ) != document ) {
					setDocument( context );
				}
				return jQuery.contains( context, elem );
			};


			find.attr = function( elem, name ) {

				// Set document vars if needed
				// Support: IE 11+, Edge 17 - 18+
				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				if ( ( elem.ownerDocument || elem ) != document ) {
					setDocument( elem );
				}

				var fn = Expr.attrHandle[ name.toLowerCase() ],

					// Don't get fooled by Object.prototype properties (see trac-13807)
					val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
						fn( elem, name, !documentIsHTML ) :
						undefined;

				if ( val !== undefined ) {
					return val;
				}

				return elem.getAttribute( name );
			};

			find.error = function( msg ) {
				throw new Error( "Syntax error, unrecognized expression: " + msg );
			};

			/**
			 * Document sorting and removing duplicates
			 * @param {ArrayLike} results
			 */
			jQuery.uniqueSort = function( results ) {
				var elem,
					duplicates = [],
					j = 0,
					i = 0;

				// Unless we *know* we can detect duplicates, assume their presence
				//
				// Support: Android <=4.0+
				// Testing for detecting duplicates is unpredictable so instead assume we can't
				// depend on duplicate detection in all browsers without a stable sort.
				hasDuplicate = !support.sortStable;
				sortInput = !support.sortStable && slice.call( results, 0 );
				sort.call( results, sortOrder );

				if ( hasDuplicate ) {
					while ( ( elem = results[ i++ ] ) ) {
						if ( elem === results[ i ] ) {
							j = duplicates.push( i );
						}
					}
					while ( j-- ) {
						splice.call( results, duplicates[ j ], 1 );
					}
				}

				// Clear input after sorting to release objects
				// See https://github.com/jquery/sizzle/pull/225
				sortInput = null;

				return results;
			};

			jQuery.fn.uniqueSort = function() {
				return this.pushStack( jQuery.uniqueSort( slice.apply( this ) ) );
			};

			Expr = jQuery.expr = {

				// Can be adjusted by the user
				cacheLength: 50,

				createPseudo: markFunction,

				match: matchExpr,

				attrHandle: {},

				find: {},

				relative: {
					">": { dir: "parentNode", first: true },
					" ": { dir: "parentNode" },
					"+": { dir: "previousSibling", first: true },
					"~": { dir: "previousSibling" }
				},

				preFilter: {
					ATTR: function( match ) {
						match[ 1 ] = match[ 1 ].replace( runescape, funescape );

						// Move the given value to match[3] whether quoted or unquoted
						match[ 3 ] = ( match[ 3 ] || match[ 4 ] || match[ 5 ] || "" )
							.replace( runescape, funescape );

						if ( match[ 2 ] === "~=" ) {
							match[ 3 ] = " " + match[ 3 ] + " ";
						}

						return match.slice( 0, 4 );
					},

					CHILD: function( match ) {

						/* matches from matchExpr["CHILD"]
							1 type (only|nth|...)
							2 what (child|of-type)
							3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
							4 xn-component of xn+y argument ([+-]?\d*n|)
							5 sign of xn-component
							6 x of xn-component
							7 sign of y-component
							8 y of y-component
						*/
						match[ 1 ] = match[ 1 ].toLowerCase();

						if ( match[ 1 ].slice( 0, 3 ) === "nth" ) {

							// nth-* requires argument
							if ( !match[ 3 ] ) {
								find.error( match[ 0 ] );
							}

							// numeric x and y parameters for Expr.filter.CHILD
							// remember that false/true cast respectively to 0/1
							match[ 4 ] = +( match[ 4 ] ?
								match[ 5 ] + ( match[ 6 ] || 1 ) :
								2 * ( match[ 3 ] === "even" || match[ 3 ] === "odd" )
							);
							match[ 5 ] = +( ( match[ 7 ] + match[ 8 ] ) || match[ 3 ] === "odd" );

						// other types prohibit arguments
						} else if ( match[ 3 ] ) {
							find.error( match[ 0 ] );
						}

						return match;
					},

					PSEUDO: function( match ) {
						var excess,
							unquoted = !match[ 6 ] && match[ 2 ];

						if ( matchExpr.CHILD.test( match[ 0 ] ) ) {
							return null;
						}

						// Accept quoted arguments as-is
						if ( match[ 3 ] ) {
							match[ 2 ] = match[ 4 ] || match[ 5 ] || "";

						// Strip excess characters from unquoted arguments
						} else if ( unquoted && rpseudo.test( unquoted ) &&

							// Get excess from tokenize (recursively)
							( excess = tokenize( unquoted, true ) ) &&

							// advance to the next closing parenthesis
							( excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length ) ) {

							// excess is a negative index
							match[ 0 ] = match[ 0 ].slice( 0, excess );
							match[ 2 ] = unquoted.slice( 0, excess );
						}

						// Return only captures needed by the pseudo filter method (type and argument)
						return match.slice( 0, 3 );
					}
				},

				filter: {

					TAG: function( nodeNameSelector ) {
						var expectedNodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
						return nodeNameSelector === "*" ?
							function() {
								return true;
							} :
							function( elem ) {
								return nodeName( elem, expectedNodeName );
							};
					},

					CLASS: function( className ) {
						var pattern = classCache[ className + " " ];

						return pattern ||
							( pattern = new RegExp( "(^|" + whitespace + ")" + className +
								"(" + whitespace + "|$)" ) ) &&
							classCache( className, function( elem ) {
								return pattern.test(
									typeof elem.className === "string" && elem.className ||
										typeof elem.getAttribute !== "undefined" &&
											elem.getAttribute( "class" ) ||
										""
								);
							} );
					},

					ATTR: function( name, operator, check ) {
						return function( elem ) {
							var result = find.attr( elem, name );

							if ( result == null ) {
								return operator === "!=";
							}
							if ( !operator ) {
								return true;
							}

							result += "";

							if ( operator === "=" ) {
								return result === check;
							}
							if ( operator === "!=" ) {
								return result !== check;
							}
							if ( operator === "^=" ) {
								return check && result.indexOf( check ) === 0;
							}
							if ( operator === "*=" ) {
								return check && result.indexOf( check ) > -1;
							}
							if ( operator === "$=" ) {
								return check && result.slice( -check.length ) === check;
							}
							if ( operator === "~=" ) {
								return ( " " + result.replace( rwhitespace, " " ) + " " )
									.indexOf( check ) > -1;
							}
							if ( operator === "|=" ) {
								return result === check || result.slice( 0, check.length + 1 ) === check + "-";
							}

							return false;
						};
					},

					CHILD: function( type, what, _argument, first, last ) {
						var simple = type.slice( 0, 3 ) !== "nth",
							forward = type.slice( -4 ) !== "last",
							ofType = what === "of-type";

						return first === 1 && last === 0 ?

							// Shortcut for :nth-*(n)
							function( elem ) {
								return !!elem.parentNode;
							} :

							function( elem, _context, xml ) {
								var cache, outerCache, node, nodeIndex, start,
									dir = simple !== forward ? "nextSibling" : "previousSibling",
									parent = elem.parentNode,
									name = ofType && elem.nodeName.toLowerCase(),
									useCache = !xml && !ofType,
									diff = false;

								if ( parent ) {

									// :(first|last|only)-(child|of-type)
									if ( simple ) {
										while ( dir ) {
											node = elem;
											while ( ( node = node[ dir ] ) ) {
												if ( ofType ?
													nodeName( node, name ) :
													node.nodeType === 1 ) {

													return false;
												}
											}

											// Reverse direction for :only-* (if we haven't yet done so)
											start = dir = type === "only" && !start && "nextSibling";
										}
										return true;
									}

									start = [ forward ? parent.firstChild : parent.lastChild ];

									// non-xml :nth-child(...) stores cache data on `parent`
									if ( forward && useCache ) {

										// Seek `elem` from a previously-cached index
										outerCache = parent[ expando ] || ( parent[ expando ] = {} );
										cache = outerCache[ type ] || [];
										nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
										diff = nodeIndex && cache[ 2 ];
										node = nodeIndex && parent.childNodes[ nodeIndex ];

										while ( ( node = ++nodeIndex && node && node[ dir ] ||

											// Fallback to seeking `elem` from the start
											( diff = nodeIndex = 0 ) || start.pop() ) ) {

											// When found, cache indexes on `parent` and break
											if ( node.nodeType === 1 && ++diff && node === elem ) {
												outerCache[ type ] = [ dirruns, nodeIndex, diff ];
												break;
											}
										}

									} else {

										// Use previously-cached element index if available
										if ( useCache ) {
											outerCache = elem[ expando ] || ( elem[ expando ] = {} );
											cache = outerCache[ type ] || [];
											nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
											diff = nodeIndex;
										}

										// xml :nth-child(...)
										// or :nth-last-child(...) or :nth(-last)?-of-type(...)
										if ( diff === false ) {

											// Use the same loop as above to seek `elem` from the start
											while ( ( node = ++nodeIndex && node && node[ dir ] ||
												( diff = nodeIndex = 0 ) || start.pop() ) ) {

												if ( ( ofType ?
													nodeName( node, name ) :
													node.nodeType === 1 ) &&
													++diff ) {

													// Cache the index of each encountered element
													if ( useCache ) {
														outerCache = node[ expando ] ||
															( node[ expando ] = {} );
														outerCache[ type ] = [ dirruns, diff ];
													}

													if ( node === elem ) {
														break;
													}
												}
											}
										}
									}

									// Incorporate the offset, then check against cycle size
									diff -= last;
									return diff === first || ( diff % first === 0 && diff / first >= 0 );
								}
							};
					},

					PSEUDO: function( pseudo, argument ) {

						// pseudo-class names are case-insensitive
						// https://www.w3.org/TR/selectors/#pseudo-classes
						// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
						// Remember that setFilters inherits from pseudos
						var args,
							fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
								find.error( "unsupported pseudo: " + pseudo );

						// The user may use createPseudo to indicate that
						// arguments are needed to create the filter function
						// just as jQuery does
						if ( fn[ expando ] ) {
							return fn( argument );
						}

						// But maintain support for old signatures
						if ( fn.length > 1 ) {
							args = [ pseudo, pseudo, "", argument ];
							return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
								markFunction( function( seed, matches ) {
									var idx,
										matched = fn( seed, argument ),
										i = matched.length;
									while ( i-- ) {
										idx = indexOf.call( seed, matched[ i ] );
										seed[ idx ] = !( matches[ idx ] = matched[ i ] );
									}
								} ) :
								function( elem ) {
									return fn( elem, 0, args );
								};
						}

						return fn;
					}
				},

				pseudos: {

					// Potentially complex pseudos
					not: markFunction( function( selector ) {

						// Trim the selector passed to compile
						// to avoid treating leading and trailing
						// spaces as combinators
						var input = [],
							results = [],
							matcher = compile( selector.replace( rtrimCSS, "$1" ) );

						return matcher[ expando ] ?
							markFunction( function( seed, matches, _context, xml ) {
								var elem,
									unmatched = matcher( seed, null, xml, [] ),
									i = seed.length;

								// Match elements unmatched by `matcher`
								while ( i-- ) {
									if ( ( elem = unmatched[ i ] ) ) {
										seed[ i ] = !( matches[ i ] = elem );
									}
								}
							} ) :
							function( elem, _context, xml ) {
								input[ 0 ] = elem;
								matcher( input, null, xml, results );

								// Don't keep the element
								// (see https://github.com/jquery/sizzle/issues/299)
								input[ 0 ] = null;
								return !results.pop();
							};
					} ),

					has: markFunction( function( selector ) {
						return function( elem ) {
							return find( selector, elem ).length > 0;
						};
					} ),

					contains: markFunction( function( text ) {
						text = text.replace( runescape, funescape );
						return function( elem ) {
							return ( elem.textContent || jQuery.text( elem ) ).indexOf( text ) > -1;
						};
					} ),

					// "Whether an element is represented by a :lang() selector
					// is based solely on the element's language value
					// being equal to the identifier C,
					// or beginning with the identifier C immediately followed by "-".
					// The matching of C against the element's language value is performed case-insensitively.
					// The identifier C does not have to be a valid language name."
					// https://www.w3.org/TR/selectors/#lang-pseudo
					lang: markFunction( function( lang ) {

						// lang value must be a valid identifier
						if ( !ridentifier.test( lang || "" ) ) {
							find.error( "unsupported lang: " + lang );
						}
						lang = lang.replace( runescape, funescape ).toLowerCase();
						return function( elem ) {
							var elemLang;
							do {
								if ( ( elemLang = documentIsHTML ?
									elem.lang :
									elem.getAttribute( "xml:lang" ) || elem.getAttribute( "lang" ) ) ) {

									elemLang = elemLang.toLowerCase();
									return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
								}
							} while ( ( elem = elem.parentNode ) && elem.nodeType === 1 );
							return false;
						};
					} ),

					// Miscellaneous
					target: function( elem ) {
						var hash = window.location && window.location.hash;
						return hash && hash.slice( 1 ) === elem.id;
					},

					root: function( elem ) {
						return elem === documentElement;
					},

					focus: function( elem ) {
						return elem === safeActiveElement() &&
							document.hasFocus() &&
							!!( elem.type || elem.href || ~elem.tabIndex );
					},

					// Boolean properties
					enabled: createDisabledPseudo( false ),
					disabled: createDisabledPseudo( true ),

					checked: function( elem ) {

						// In CSS3, :checked should return both checked and selected elements
						// https://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
						return ( nodeName( elem, "input" ) && !!elem.checked ) ||
							( nodeName( elem, "option" ) && !!elem.selected );
					},

					selected: function( elem ) {

						// Support: IE <=11+
						// Accessing the selectedIndex property
						// forces the browser to treat the default option as
						// selected when in an optgroup.
						if ( elem.parentNode ) {
							// eslint-disable-next-line no-unused-expressions
							elem.parentNode.selectedIndex;
						}

						return elem.selected === true;
					},

					// Contents
					empty: function( elem ) {

						// https://www.w3.org/TR/selectors/#empty-pseudo
						// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
						//   but not by others (comment: 8; processing instruction: 7; etc.)
						// nodeType < 6 works because attributes (2) do not appear as children
						for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
							if ( elem.nodeType < 6 ) {
								return false;
							}
						}
						return true;
					},

					parent: function( elem ) {
						return !Expr.pseudos.empty( elem );
					},

					// Element/input types
					header: function( elem ) {
						return rheader.test( elem.nodeName );
					},

					input: function( elem ) {
						return rinputs.test( elem.nodeName );
					},

					button: function( elem ) {
						return nodeName( elem, "input" ) && elem.type === "button" ||
							nodeName( elem, "button" );
					},

					text: function( elem ) {
						var attr;
						return nodeName( elem, "input" ) && elem.type === "text" &&

							// Support: IE <10 only
							// New HTML5 attribute values (e.g., "search") appear
							// with elem.type === "text"
							( ( attr = elem.getAttribute( "type" ) ) == null ||
								attr.toLowerCase() === "text" );
					},

					// Position-in-collection
					first: createPositionalPseudo( function() {
						return [ 0 ];
					} ),

					last: createPositionalPseudo( function( _matchIndexes, length ) {
						return [ length - 1 ];
					} ),

					eq: createPositionalPseudo( function( _matchIndexes, length, argument ) {
						return [ argument < 0 ? argument + length : argument ];
					} ),

					even: createPositionalPseudo( function( matchIndexes, length ) {
						var i = 0;
						for ( ; i < length; i += 2 ) {
							matchIndexes.push( i );
						}
						return matchIndexes;
					} ),

					odd: createPositionalPseudo( function( matchIndexes, length ) {
						var i = 1;
						for ( ; i < length; i += 2 ) {
							matchIndexes.push( i );
						}
						return matchIndexes;
					} ),

					lt: createPositionalPseudo( function( matchIndexes, length, argument ) {
						var i;

						if ( argument < 0 ) {
							i = argument + length;
						} else if ( argument > length ) {
							i = length;
						} else {
							i = argument;
						}

						for ( ; --i >= 0; ) {
							matchIndexes.push( i );
						}
						return matchIndexes;
					} ),

					gt: createPositionalPseudo( function( matchIndexes, length, argument ) {
						var i = argument < 0 ? argument + length : argument;
						for ( ; ++i < length; ) {
							matchIndexes.push( i );
						}
						return matchIndexes;
					} )
				}
			};

			Expr.pseudos.nth = Expr.pseudos.eq;

			// Add button/input type pseudos
			for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
				Expr.pseudos[ i ] = createInputPseudo( i );
			}
			for ( i in { submit: true, reset: true } ) {
				Expr.pseudos[ i ] = createButtonPseudo( i );
			}

			// Easy API for creating new setFilters
			function setFilters() {}
			setFilters.prototype = Expr.filters = Expr.pseudos;
			Expr.setFilters = new setFilters();

			function tokenize( selector, parseOnly ) {
				var matched, match, tokens, type,
					soFar, groups, preFilters,
					cached = tokenCache[ selector + " " ];

				if ( cached ) {
					return parseOnly ? 0 : cached.slice( 0 );
				}

				soFar = selector;
				groups = [];
				preFilters = Expr.preFilter;

				while ( soFar ) {

					// Comma and first run
					if ( !matched || ( match = rcomma.exec( soFar ) ) ) {
						if ( match ) {

							// Don't consume trailing commas as valid
							soFar = soFar.slice( match[ 0 ].length ) || soFar;
						}
						groups.push( ( tokens = [] ) );
					}

					matched = false;

					// Combinators
					if ( ( match = rleadingCombinator.exec( soFar ) ) ) {
						matched = match.shift();
						tokens.push( {
							value: matched,

							// Cast descendant combinators to space
							type: match[ 0 ].replace( rtrimCSS, " " )
						} );
						soFar = soFar.slice( matched.length );
					}

					// Filters
					for ( type in Expr.filter ) {
						if ( ( match = matchExpr[ type ].exec( soFar ) ) && ( !preFilters[ type ] ||
							( match = preFilters[ type ]( match ) ) ) ) {
							matched = match.shift();
							tokens.push( {
								value: matched,
								type: type,
								matches: match
							} );
							soFar = soFar.slice( matched.length );
						}
					}

					if ( !matched ) {
						break;
					}
				}

				// Return the length of the invalid excess
				// if we're just parsing
				// Otherwise, throw an error or return tokens
				if ( parseOnly ) {
					return soFar.length;
				}

				return soFar ?
					find.error( selector ) :

					// Cache the tokens
					tokenCache( selector, groups ).slice( 0 );
			}

			function toSelector( tokens ) {
				var i = 0,
					len = tokens.length,
					selector = "";
				for ( ; i < len; i++ ) {
					selector += tokens[ i ].value;
				}
				return selector;
			}

			function addCombinator( matcher, combinator, base ) {
				var dir = combinator.dir,
					skip = combinator.next,
					key = skip || dir,
					checkNonElements = base && key === "parentNode",
					doneName = done++;

				return combinator.first ?

					// Check against closest ancestor/preceding element
					function( elem, context, xml ) {
						while ( ( elem = elem[ dir ] ) ) {
							if ( elem.nodeType === 1 || checkNonElements ) {
								return matcher( elem, context, xml );
							}
						}
						return false;
					} :

					// Check against all ancestor/preceding elements
					function( elem, context, xml ) {
						var oldCache, outerCache,
							newCache = [ dirruns, doneName ];

						// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
						if ( xml ) {
							while ( ( elem = elem[ dir ] ) ) {
								if ( elem.nodeType === 1 || checkNonElements ) {
									if ( matcher( elem, context, xml ) ) {
										return true;
									}
								}
							}
						} else {
							while ( ( elem = elem[ dir ] ) ) {
								if ( elem.nodeType === 1 || checkNonElements ) {
									outerCache = elem[ expando ] || ( elem[ expando ] = {} );

									if ( skip && nodeName( elem, skip ) ) {
										elem = elem[ dir ] || elem;
									} else if ( ( oldCache = outerCache[ key ] ) &&
										oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

										// Assign to newCache so results back-propagate to previous elements
										return ( newCache[ 2 ] = oldCache[ 2 ] );
									} else {

										// Reuse newcache so results back-propagate to previous elements
										outerCache[ key ] = newCache;

										// A match means we're done; a fail means we have to keep checking
										if ( ( newCache[ 2 ] = matcher( elem, context, xml ) ) ) {
											return true;
										}
									}
								}
							}
						}
						return false;
					};
			}

			function elementMatcher( matchers ) {
				return matchers.length > 1 ?
					function( elem, context, xml ) {
						var i = matchers.length;
						while ( i-- ) {
							if ( !matchers[ i ]( elem, context, xml ) ) {
								return false;
							}
						}
						return true;
					} :
					matchers[ 0 ];
			}

			function multipleContexts( selector, contexts, results ) {
				var i = 0,
					len = contexts.length;
				for ( ; i < len; i++ ) {
					find( selector, contexts[ i ], results );
				}
				return results;
			}

			function condense( unmatched, map, filter, context, xml ) {
				var elem,
					newUnmatched = [],
					i = 0,
					len = unmatched.length,
					mapped = map != null;

				for ( ; i < len; i++ ) {
					if ( ( elem = unmatched[ i ] ) ) {
						if ( !filter || filter( elem, context, xml ) ) {
							newUnmatched.push( elem );
							if ( mapped ) {
								map.push( i );
							}
						}
					}
				}

				return newUnmatched;
			}

			function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
				if ( postFilter && !postFilter[ expando ] ) {
					postFilter = setMatcher( postFilter );
				}
				if ( postFinder && !postFinder[ expando ] ) {
					postFinder = setMatcher( postFinder, postSelector );
				}
				return markFunction( function( seed, results, context, xml ) {
					var temp, i, elem, matcherOut,
						preMap = [],
						postMap = [],
						preexisting = results.length,

						// Get initial elements from seed or context
						elems = seed ||
							multipleContexts( selector || "*",
								context.nodeType ? [ context ] : context, [] ),

						// Prefilter to get matcher input, preserving a map for seed-results synchronization
						matcherIn = preFilter && ( seed || !selector ) ?
							condense( elems, preMap, preFilter, context, xml ) :
							elems;

					if ( matcher ) {

						// If we have a postFinder, or filtered seed, or non-seed postFilter
						// or preexisting results,
						matcherOut = postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

							// ...intermediate processing is necessary
							[] :

							// ...otherwise use results directly
							results;

						// Find primary matches
						matcher( matcherIn, matcherOut, context, xml );
					} else {
						matcherOut = matcherIn;
					}

					// Apply postFilter
					if ( postFilter ) {
						temp = condense( matcherOut, postMap );
						postFilter( temp, [], context, xml );

						// Un-match failing elements by moving them back to matcherIn
						i = temp.length;
						while ( i-- ) {
							if ( ( elem = temp[ i ] ) ) {
								matcherOut[ postMap[ i ] ] = !( matcherIn[ postMap[ i ] ] = elem );
							}
						}
					}

					if ( seed ) {
						if ( postFinder || preFilter ) {
							if ( postFinder ) {

								// Get the final matcherOut by condensing this intermediate into postFinder contexts
								temp = [];
								i = matcherOut.length;
								while ( i-- ) {
									if ( ( elem = matcherOut[ i ] ) ) {

										// Restore matcherIn since elem is not yet a final match
										temp.push( ( matcherIn[ i ] = elem ) );
									}
								}
								postFinder( null, ( matcherOut = [] ), temp, xml );
							}

							// Move matched elements from seed to results to keep them synchronized
							i = matcherOut.length;
							while ( i-- ) {
								if ( ( elem = matcherOut[ i ] ) &&
									( temp = postFinder ? indexOf.call( seed, elem ) : preMap[ i ] ) > -1 ) {

									seed[ temp ] = !( results[ temp ] = elem );
								}
							}
						}

					// Add elements to results, through postFinder if defined
					} else {
						matcherOut = condense(
							matcherOut === results ?
								matcherOut.splice( preexisting, matcherOut.length ) :
								matcherOut
						);
						if ( postFinder ) {
							postFinder( null, results, matcherOut, xml );
						} else {
							push.apply( results, matcherOut );
						}
					}
				} );
			}

			function matcherFromTokens( tokens ) {
				var checkContext, matcher, j,
					len = tokens.length,
					leadingRelative = Expr.relative[ tokens[ 0 ].type ],
					implicitRelative = leadingRelative || Expr.relative[ " " ],
					i = leadingRelative ? 1 : 0,

					// The foundational matcher ensures that elements are reachable from top-level context(s)
					matchContext = addCombinator( function( elem ) {
						return elem === checkContext;
					}, implicitRelative, true ),
					matchAnyContext = addCombinator( function( elem ) {
						return indexOf.call( checkContext, elem ) > -1;
					}, implicitRelative, true ),
					matchers = [ function( elem, context, xml ) {

						// Support: IE 11+, Edge 17 - 18+
						// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
						// two documents; shallow comparisons work.
						// eslint-disable-next-line eqeqeq
						var ret = ( !leadingRelative && ( xml || context != outermostContext ) ) || (
							( checkContext = context ).nodeType ?
								matchContext( elem, context, xml ) :
								matchAnyContext( elem, context, xml ) );

						// Avoid hanging onto element
						// (see https://github.com/jquery/sizzle/issues/299)
						checkContext = null;
						return ret;
					} ];

				for ( ; i < len; i++ ) {
					if ( ( matcher = Expr.relative[ tokens[ i ].type ] ) ) {
						matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
					} else {
						matcher = Expr.filter[ tokens[ i ].type ].apply( null, tokens[ i ].matches );

						// Return special upon seeing a positional matcher
						if ( matcher[ expando ] ) {

							// Find the next relative operator (if any) for proper handling
							j = ++i;
							for ( ; j < len; j++ ) {
								if ( Expr.relative[ tokens[ j ].type ] ) {
									break;
								}
							}
							return setMatcher(
								i > 1 && elementMatcher( matchers ),
								i > 1 && toSelector(

									// If the preceding token was a descendant combinator, insert an implicit any-element `*`
									tokens.slice( 0, i - 1 )
										.concat( { value: tokens[ i - 2 ].type === " " ? "*" : "" } )
								).replace( rtrimCSS, "$1" ),
								matcher,
								i < j && matcherFromTokens( tokens.slice( i, j ) ),
								j < len && matcherFromTokens( ( tokens = tokens.slice( j ) ) ),
								j < len && toSelector( tokens )
							);
						}
						matchers.push( matcher );
					}
				}

				return elementMatcher( matchers );
			}

			function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
				var bySet = setMatchers.length > 0,
					byElement = elementMatchers.length > 0,
					superMatcher = function( seed, context, xml, results, outermost ) {
						var elem, j, matcher,
							matchedCount = 0,
							i = "0",
							unmatched = seed && [],
							setMatched = [],
							contextBackup = outermostContext,

							// We must always have either seed elements or outermost context
							elems = seed || byElement && Expr.find.TAG( "*", outermost ),

							// Use integer dirruns iff this is the outermost matcher
							dirrunsUnique = ( dirruns += contextBackup == null ? 1 : Math.random() || 0.1 ),
							len = elems.length;

						if ( outermost ) {

							// Support: IE 11+, Edge 17 - 18+
							// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
							// two documents; shallow comparisons work.
							// eslint-disable-next-line eqeqeq
							outermostContext = context == document || context || outermost;
						}

						// Add elements passing elementMatchers directly to results
						// Support: iOS <=7 - 9 only
						// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching
						// elements by id. (see trac-14142)
						for ( ; i !== len && ( elem = elems[ i ] ) != null; i++ ) {
							if ( byElement && elem ) {
								j = 0;

								// Support: IE 11+, Edge 17 - 18+
								// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
								// two documents; shallow comparisons work.
								// eslint-disable-next-line eqeqeq
								if ( !context && elem.ownerDocument != document ) {
									setDocument( elem );
									xml = !documentIsHTML;
								}
								while ( ( matcher = elementMatchers[ j++ ] ) ) {
									if ( matcher( elem, context || document, xml ) ) {
										push.call( results, elem );
										break;
									}
								}
								if ( outermost ) {
									dirruns = dirrunsUnique;
								}
							}

							// Track unmatched elements for set filters
							if ( bySet ) {

								// They will have gone through all possible matchers
								if ( ( elem = !matcher && elem ) ) {
									matchedCount--;
								}

								// Lengthen the array for every element, matched or not
								if ( seed ) {
									unmatched.push( elem );
								}
							}
						}

						// `i` is now the count of elements visited above, and adding it to `matchedCount`
						// makes the latter nonnegative.
						matchedCount += i;

						// Apply set filters to unmatched elements
						// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
						// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
						// no element matchers and no seed.
						// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
						// case, which will result in a "00" `matchedCount` that differs from `i` but is also
						// numerically zero.
						if ( bySet && i !== matchedCount ) {
							j = 0;
							while ( ( matcher = setMatchers[ j++ ] ) ) {
								matcher( unmatched, setMatched, context, xml );
							}

							if ( seed ) {

								// Reintegrate element matches to eliminate the need for sorting
								if ( matchedCount > 0 ) {
									while ( i-- ) {
										if ( !( unmatched[ i ] || setMatched[ i ] ) ) {
											setMatched[ i ] = pop.call( results );
										}
									}
								}

								// Discard index placeholder values to get only actual matches
								setMatched = condense( setMatched );
							}

							// Add matches to results
							push.apply( results, setMatched );

							// Seedless set matches succeeding multiple successful matchers stipulate sorting
							if ( outermost && !seed && setMatched.length > 0 &&
								( matchedCount + setMatchers.length ) > 1 ) {

								jQuery.uniqueSort( results );
							}
						}

						// Override manipulation of globals by nested matchers
						if ( outermost ) {
							dirruns = dirrunsUnique;
							outermostContext = contextBackup;
						}

						return unmatched;
					};

				return bySet ?
					markFunction( superMatcher ) :
					superMatcher;
			}

			function compile( selector, match /* Internal Use Only */ ) {
				var i,
					setMatchers = [],
					elementMatchers = [],
					cached = compilerCache[ selector + " " ];

				if ( !cached ) {

					// Generate a function of recursive functions that can be used to check each element
					if ( !match ) {
						match = tokenize( selector );
					}
					i = match.length;
					while ( i-- ) {
						cached = matcherFromTokens( match[ i ] );
						if ( cached[ expando ] ) {
							setMatchers.push( cached );
						} else {
							elementMatchers.push( cached );
						}
					}

					// Cache the compiled function
					cached = compilerCache( selector,
						matcherFromGroupMatchers( elementMatchers, setMatchers ) );

					// Save selector and tokenization
					cached.selector = selector;
				}
				return cached;
			}

			/**
			 * A low-level selection function that works with jQuery's compiled
			 *  selector functions
			 * @param {String|Function} selector A selector or a pre-compiled
			 *  selector function built with jQuery selector compile
			 * @param {Element} context
			 * @param {Array} [results]
			 * @param {Array} [seed] A set of elements to match against
			 */
			function select( selector, context, results, seed ) {
				var i, tokens, token, type, find,
					compiled = typeof selector === "function" && selector,
					match = !seed && tokenize( ( selector = compiled.selector || selector ) );

				results = results || [];

				// Try to minimize operations if there is only one selector in the list and no seed
				// (the latter of which guarantees us context)
				if ( match.length === 1 ) {

					// Reduce context if the leading compound selector is an ID
					tokens = match[ 0 ] = match[ 0 ].slice( 0 );
					if ( tokens.length > 2 && ( token = tokens[ 0 ] ).type === "ID" &&
							context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[ 1 ].type ] ) {

						context = ( Expr.find.ID(
							token.matches[ 0 ].replace( runescape, funescape ),
							context
						) || [] )[ 0 ];
						if ( !context ) {
							return results;

						// Precompiled matchers will still verify ancestry, so step up a level
						} else if ( compiled ) {
							context = context.parentNode;
						}

						selector = selector.slice( tokens.shift().value.length );
					}

					// Fetch a seed set for right-to-left matching
					i = matchExpr.needsContext.test( selector ) ? 0 : tokens.length;
					while ( i-- ) {
						token = tokens[ i ];

						// Abort if we hit a combinator
						if ( Expr.relative[ ( type = token.type ) ] ) {
							break;
						}
						if ( ( find = Expr.find[ type ] ) ) {

							// Search, expanding context for leading sibling combinators
							if ( ( seed = find(
								token.matches[ 0 ].replace( runescape, funescape ),
								rsibling.test( tokens[ 0 ].type ) &&
									testContext( context.parentNode ) || context
							) ) ) {

								// If seed is empty or no tokens remain, we can return early
								tokens.splice( i, 1 );
								selector = seed.length && toSelector( tokens );
								if ( !selector ) {
									push.apply( results, seed );
									return results;
								}

								break;
							}
						}
					}
				}

				// Compile and execute a filtering function if one is not provided
				// Provide `match` to avoid retokenization if we modified the selector above
				( compiled || compile( selector, match ) )(
					seed,
					context,
					!documentIsHTML,
					results,
					!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
				);
				return results;
			}

			// One-time assignments

			// Support: Android <=4.0 - 4.1+
			// Sort stability
			support.sortStable = expando.split( "" ).sort( sortOrder ).join( "" ) === expando;

			// Initialize against the default document
			setDocument();

			// Support: Android <=4.0 - 4.1+
			// Detached nodes confoundingly follow *each other*
			support.sortDetached = assert( function( el ) {

				// Should return 1, but returns 4 (following)
				return el.compareDocumentPosition( document.createElement( "fieldset" ) ) & 1;
			} );

			jQuery.find = find;

			// Deprecated
			jQuery.expr[ ":" ] = jQuery.expr.pseudos;
			jQuery.unique = jQuery.uniqueSort;

			// These have always been private, but they used to be documented as part of
			// Sizzle so let's maintain them for now for backwards compatibility purposes.
			find.compile = compile;
			find.select = select;
			find.setDocument = setDocument;
			find.tokenize = tokenize;

			find.escape = jQuery.escapeSelector;
			find.getText = jQuery.text;
			find.isXML = jQuery.isXMLDoc;
			find.selectors = jQuery.expr;
			find.support = jQuery.support;
			find.uniqueSort = jQuery.uniqueSort;

				/* eslint-enable */

			} )();


			var dir = function( elem, dir, until ) {
				var matched = [],
					truncate = until !== undefined;

				while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
					if ( elem.nodeType === 1 ) {
						if ( truncate && jQuery( elem ).is( until ) ) {
							break;
						}
						matched.push( elem );
					}
				}
				return matched;
			};


			var siblings = function( n, elem ) {
				var matched = [];

				for ( ; n; n = n.nextSibling ) {
					if ( n.nodeType === 1 && n !== elem ) {
						matched.push( n );
					}
				}

				return matched;
			};


			var rneedsContext = jQuery.expr.match.needsContext;

			var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



			// Implement the identical functionality for filter and not
			function winnow( elements, qualifier, not ) {
				if ( isFunction( qualifier ) ) {
					return jQuery.grep( elements, function( elem, i ) {
						return !!qualifier.call( elem, i, elem ) !== not;
					} );
				}

				// Single element
				if ( qualifier.nodeType ) {
					return jQuery.grep( elements, function( elem ) {
						return ( elem === qualifier ) !== not;
					} );
				}

				// Arraylike of elements (jQuery, arguments, Array)
				if ( typeof qualifier !== "string" ) {
					return jQuery.grep( elements, function( elem ) {
						return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
					} );
				}

				// Filtered directly for both simple and complex selectors
				return jQuery.filter( qualifier, elements, not );
			}

			jQuery.filter = function( expr, elems, not ) {
				var elem = elems[ 0 ];

				if ( not ) {
					expr = ":not(" + expr + ")";
				}

				if ( elems.length === 1 && elem.nodeType === 1 ) {
					return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
				}

				return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
					return elem.nodeType === 1;
				} ) );
			};

			jQuery.fn.extend( {
				find: function( selector ) {
					var i, ret,
						len = this.length,
						self = this;

					if ( typeof selector !== "string" ) {
						return this.pushStack( jQuery( selector ).filter( function() {
							for ( i = 0; i < len; i++ ) {
								if ( jQuery.contains( self[ i ], this ) ) {
									return true;
								}
							}
						} ) );
					}

					ret = this.pushStack( [] );

					for ( i = 0; i < len; i++ ) {
						jQuery.find( selector, self[ i ], ret );
					}

					return len > 1 ? jQuery.uniqueSort( ret ) : ret;
				},
				filter: function( selector ) {
					return this.pushStack( winnow( this, selector || [], false ) );
				},
				not: function( selector ) {
					return this.pushStack( winnow( this, selector || [], true ) );
				},
				is: function( selector ) {
					return !!winnow(
						this,

						// If this is a positional/relative selector, check membership in the returned set
						// so $("p:first").is("p:last") won't return true for a doc with two "p".
						typeof selector === "string" && rneedsContext.test( selector ) ?
							jQuery( selector ) :
							selector || [],
						false
					).length;
				}
			} );


			// Initialize a jQuery object


			// A central reference to the root jQuery(document)
			var rootjQuery,

				// A simple way to check for HTML strings
				// Prioritize #id over <tag> to avoid XSS via location.hash (trac-9521)
				// Strict HTML recognition (trac-11290: must start with <)
				// Shortcut simple #id case for speed
				rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

				init = jQuery.fn.init = function( selector, context, root ) {
					var match, elem;

					// HANDLE: $(""), $(null), $(undefined), $(false)
					if ( !selector ) {
						return this;
					}

					// Method init() accepts an alternate rootjQuery
					// so migrate can support jQuery.sub (gh-2101)
					root = root || rootjQuery;

					// Handle HTML strings
					if ( typeof selector === "string" ) {
						if ( selector[ 0 ] === "<" &&
							selector[ selector.length - 1 ] === ">" &&
							selector.length >= 3 ) {

							// Assume that strings that start and end with <> are HTML and skip the regex check
							match = [ null, selector, null ];

						} else {
							match = rquickExpr.exec( selector );
						}

						// Match html or make sure no context is specified for #id
						if ( match && ( match[ 1 ] || !context ) ) {

							// HANDLE: $(html) -> $(array)
							if ( match[ 1 ] ) {
								context = context instanceof jQuery ? context[ 0 ] : context;

								// Option to run scripts is true for back-compat
								// Intentionally let the error be thrown if parseHTML is not present
								jQuery.merge( this, jQuery.parseHTML(
									match[ 1 ],
									context && context.nodeType ? context.ownerDocument || context : document,
									true
								) );

								// HANDLE: $(html, props)
								if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
									for ( match in context ) {

										// Properties of context are called as methods if possible
										if ( isFunction( this[ match ] ) ) {
											this[ match ]( context[ match ] );

										// ...and otherwise set as attributes
										} else {
											this.attr( match, context[ match ] );
										}
									}
								}

								return this;

							// HANDLE: $(#id)
							} else {
								elem = document.getElementById( match[ 2 ] );

								if ( elem ) {

									// Inject the element directly into the jQuery object
									this[ 0 ] = elem;
									this.length = 1;
								}
								return this;
							}

						// HANDLE: $(expr, $(...))
						} else if ( !context || context.jquery ) {
							return ( context || root ).find( selector );

						// HANDLE: $(expr, context)
						// (which is just equivalent to: $(context).find(expr)
						} else {
							return this.constructor( context ).find( selector );
						}

					// HANDLE: $(DOMElement)
					} else if ( selector.nodeType ) {
						this[ 0 ] = selector;
						this.length = 1;
						return this;

					// HANDLE: $(function)
					// Shortcut for document ready
					} else if ( isFunction( selector ) ) {
						return root.ready !== undefined ?
							root.ready( selector ) :

							// Execute immediately if ready is not present
							selector( jQuery );
					}

					return jQuery.makeArray( selector, this );
				};

			// Give the init function the jQuery prototype for later instantiation
			init.prototype = jQuery.fn;

			// Initialize central reference
			rootjQuery = jQuery( document );


			var rparentsprev = /^(?:parents|prev(?:Until|All))/,

				// Methods guaranteed to produce a unique set when starting from a unique set
				guaranteedUnique = {
					children: true,
					contents: true,
					next: true,
					prev: true
				};

			jQuery.fn.extend( {
				has: function( target ) {
					var targets = jQuery( target, this ),
						l = targets.length;

					return this.filter( function() {
						var i = 0;
						for ( ; i < l; i++ ) {
							if ( jQuery.contains( this, targets[ i ] ) ) {
								return true;
							}
						}
					} );
				},

				closest: function( selectors, context ) {
					var cur,
						i = 0,
						l = this.length,
						matched = [],
						targets = typeof selectors !== "string" && jQuery( selectors );

					// Positional selectors never match, since there's no _selection_ context
					if ( !rneedsContext.test( selectors ) ) {
						for ( ; i < l; i++ ) {
							for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

								// Always skip document fragments
								if ( cur.nodeType < 11 && ( targets ?
									targets.index( cur ) > -1 :

									// Don't pass non-elements to jQuery#find
									cur.nodeType === 1 &&
										jQuery.find.matchesSelector( cur, selectors ) ) ) {

									matched.push( cur );
									break;
								}
							}
						}
					}

					return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
				},

				// Determine the position of an element within the set
				index: function( elem ) {

					// No argument, return index in parent
					if ( !elem ) {
						return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
					}

					// Index in selector
					if ( typeof elem === "string" ) {
						return indexOf.call( jQuery( elem ), this[ 0 ] );
					}

					// Locate the position of the desired element
					return indexOf.call( this,

						// If it receives a jQuery object, the first element is used
						elem.jquery ? elem[ 0 ] : elem
					);
				},

				add: function( selector, context ) {
					return this.pushStack(
						jQuery.uniqueSort(
							jQuery.merge( this.get(), jQuery( selector, context ) )
						)
					);
				},

				addBack: function( selector ) {
					return this.add( selector == null ?
						this.prevObject : this.prevObject.filter( selector )
					);
				}
			} );

			function sibling( cur, dir ) {
				while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
				return cur;
			}

			jQuery.each( {
				parent: function( elem ) {
					var parent = elem.parentNode;
					return parent && parent.nodeType !== 11 ? parent : null;
				},
				parents: function( elem ) {
					return dir( elem, "parentNode" );
				},
				parentsUntil: function( elem, _i, until ) {
					return dir( elem, "parentNode", until );
				},
				next: function( elem ) {
					return sibling( elem, "nextSibling" );
				},
				prev: function( elem ) {
					return sibling( elem, "previousSibling" );
				},
				nextAll: function( elem ) {
					return dir( elem, "nextSibling" );
				},
				prevAll: function( elem ) {
					return dir( elem, "previousSibling" );
				},
				nextUntil: function( elem, _i, until ) {
					return dir( elem, "nextSibling", until );
				},
				prevUntil: function( elem, _i, until ) {
					return dir( elem, "previousSibling", until );
				},
				siblings: function( elem ) {
					return siblings( ( elem.parentNode || {} ).firstChild, elem );
				},
				children: function( elem ) {
					return siblings( elem.firstChild );
				},
				contents: function( elem ) {
					if ( elem.contentDocument != null &&

						// Support: IE 11+
						// <object> elements with no `data` attribute has an object
						// `contentDocument` with a `null` prototype.
						getProto( elem.contentDocument ) ) {

						return elem.contentDocument;
					}

					// Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
					// Treat the template element as a regular one in browsers that
					// don't support it.
					if ( nodeName( elem, "template" ) ) {
						elem = elem.content || elem;
					}

					return jQuery.merge( [], elem.childNodes );
				}
			}, function( name, fn ) {
				jQuery.fn[ name ] = function( until, selector ) {
					var matched = jQuery.map( this, fn, until );

					if ( name.slice( -5 ) !== "Until" ) {
						selector = until;
					}

					if ( selector && typeof selector === "string" ) {
						matched = jQuery.filter( selector, matched );
					}

					if ( this.length > 1 ) {

						// Remove duplicates
						if ( !guaranteedUnique[ name ] ) {
							jQuery.uniqueSort( matched );
						}

						// Reverse order for parents* and prev-derivatives
						if ( rparentsprev.test( name ) ) {
							matched.reverse();
						}
					}

					return this.pushStack( matched );
				};
			} );
			var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



			// Convert String-formatted options into Object-formatted ones
			function createOptions( options ) {
				var object = {};
				jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
					object[ flag ] = true;
				} );
				return object;
			}

			/*
			 * Create a callback list using the following parameters:
			 *
			 *	options: an optional list of space-separated options that will change how
			 *			the callback list behaves or a more traditional option object
			 *
			 * By default a callback list will act like an event callback list and can be
			 * "fired" multiple times.
			 *
			 * Possible options:
			 *
			 *	once:			will ensure the callback list can only be fired once (like a Deferred)
			 *
			 *	memory:			will keep track of previous values and will call any callback added
			 *					after the list has been fired right away with the latest "memorized"
			 *					values (like a Deferred)
			 *
			 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
			 *
			 *	stopOnFalse:	interrupt callings when a callback returns false
			 *
			 */
			jQuery.Callbacks = function( options ) {

				// Convert options from String-formatted to Object-formatted if needed
				// (we check in cache first)
				options = typeof options === "string" ?
					createOptions( options ) :
					jQuery.extend( {}, options );

				var // Flag to know if list is currently firing
					firing,

					// Last fire value for non-forgettable lists
					memory,

					// Flag to know if list was already fired
					fired,

					// Flag to prevent firing
					locked,

					// Actual callback list
					list = [],

					// Queue of execution data for repeatable lists
					queue = [],

					// Index of currently firing callback (modified by add/remove as needed)
					firingIndex = -1,

					// Fire callbacks
					fire = function() {

						// Enforce single-firing
						locked = locked || options.once;

						// Execute callbacks for all pending executions,
						// respecting firingIndex overrides and runtime changes
						fired = firing = true;
						for ( ; queue.length; firingIndex = -1 ) {
							memory = queue.shift();
							while ( ++firingIndex < list.length ) {

								// Run callback and check for early termination
								if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
									options.stopOnFalse ) {

									// Jump to end and forget the data so .add doesn't re-fire
									firingIndex = list.length;
									memory = false;
								}
							}
						}

						// Forget the data if we're done with it
						if ( !options.memory ) {
							memory = false;
						}

						firing = false;

						// Clean up if we're done firing for good
						if ( locked ) {

							// Keep an empty list if we have data for future add calls
							if ( memory ) {
								list = [];

							// Otherwise, this object is spent
							} else {
								list = "";
							}
						}
					},

					// Actual Callbacks object
					self = {

						// Add a callback or a collection of callbacks to the list
						add: function() {
							if ( list ) {

								// If we have memory from a past run, we should fire after adding
								if ( memory && !firing ) {
									firingIndex = list.length - 1;
									queue.push( memory );
								}

								( function add( args ) {
									jQuery.each( args, function( _, arg ) {
										if ( isFunction( arg ) ) {
											if ( !options.unique || !self.has( arg ) ) {
												list.push( arg );
											}
										} else if ( arg && arg.length && toType( arg ) !== "string" ) {

											// Inspect recursively
											add( arg );
										}
									} );
								} )( arguments );

								if ( memory && !firing ) {
									fire();
								}
							}
							return this;
						},

						// Remove a callback from the list
						remove: function() {
							jQuery.each( arguments, function( _, arg ) {
								var index;
								while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
									list.splice( index, 1 );

									// Handle firing indexes
									if ( index <= firingIndex ) {
										firingIndex--;
									}
								}
							} );
							return this;
						},

						// Check if a given callback is in the list.
						// If no argument is given, return whether or not list has callbacks attached.
						has: function( fn ) {
							return fn ?
								jQuery.inArray( fn, list ) > -1 :
								list.length > 0;
						},

						// Remove all callbacks from the list
						empty: function() {
							if ( list ) {
								list = [];
							}
							return this;
						},

						// Disable .fire and .add
						// Abort any current/pending executions
						// Clear all callbacks and values
						disable: function() {
							locked = queue = [];
							list = memory = "";
							return this;
						},
						disabled: function() {
							return !list;
						},

						// Disable .fire
						// Also disable .add unless we have memory (since it would have no effect)
						// Abort any pending executions
						lock: function() {
							locked = queue = [];
							if ( !memory && !firing ) {
								list = memory = "";
							}
							return this;
						},
						locked: function() {
							return !!locked;
						},

						// Call all callbacks with the given context and arguments
						fireWith: function( context, args ) {
							if ( !locked ) {
								args = args || [];
								args = [ context, args.slice ? args.slice() : args ];
								queue.push( args );
								if ( !firing ) {
									fire();
								}
							}
							return this;
						},

						// Call all the callbacks with the given arguments
						fire: function() {
							self.fireWith( this, arguments );
							return this;
						},

						// To know if the callbacks have already been called at least once
						fired: function() {
							return !!fired;
						}
					};

				return self;
			};


			function Identity( v ) {
				return v;
			}
			function Thrower( ex ) {
				throw ex;
			}

			function adoptValue( value, resolve, reject, noValue ) {
				var method;

				try {

					// Check for promise aspect first to privilege synchronous behavior
					if ( value && isFunction( ( method = value.promise ) ) ) {
						method.call( value ).done( resolve ).fail( reject );

					// Other thenables
					} else if ( value && isFunction( ( method = value.then ) ) ) {
						method.call( value, resolve, reject );

					// Other non-thenables
					} else {

						// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
						// * false: [ value ].slice( 0 ) => resolve( value )
						// * true: [ value ].slice( 1 ) => resolve()
						resolve.apply( undefined, [ value ].slice( noValue ) );
					}

				// For Promises/A+, convert exceptions into rejections
				// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
				// Deferred#then to conditionally suppress rejection.
				} catch ( value ) {

					// Support: Android 4.0 only
					// Strict mode functions invoked without .call/.apply get global-object context
					reject.apply( undefined, [ value ] );
				}
			}

			jQuery.extend( {

				Deferred: function( func ) {
					var tuples = [

							// action, add listener, callbacks,
							// ... .then handlers, argument index, [final state]
							[ "notify", "progress", jQuery.Callbacks( "memory" ),
								jQuery.Callbacks( "memory" ), 2 ],
							[ "resolve", "done", jQuery.Callbacks( "once memory" ),
								jQuery.Callbacks( "once memory" ), 0, "resolved" ],
							[ "reject", "fail", jQuery.Callbacks( "once memory" ),
								jQuery.Callbacks( "once memory" ), 1, "rejected" ]
						],
						state = "pending",
						promise = {
							state: function() {
								return state;
							},
							always: function() {
								deferred.done( arguments ).fail( arguments );
								return this;
							},
							"catch": function( fn ) {
								return promise.then( null, fn );
							},

							// Keep pipe for back-compat
							pipe: function( /* fnDone, fnFail, fnProgress */ ) {
								var fns = arguments;

								return jQuery.Deferred( function( newDefer ) {
									jQuery.each( tuples, function( _i, tuple ) {

										// Map tuples (progress, done, fail) to arguments (done, fail, progress)
										var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

										// deferred.progress(function() { bind to newDefer or newDefer.notify })
										// deferred.done(function() { bind to newDefer or newDefer.resolve })
										// deferred.fail(function() { bind to newDefer or newDefer.reject })
										deferred[ tuple[ 1 ] ]( function() {
											var returned = fn && fn.apply( this, arguments );
											if ( returned && isFunction( returned.promise ) ) {
												returned.promise()
													.progress( newDefer.notify )
													.done( newDefer.resolve )
													.fail( newDefer.reject );
											} else {
												newDefer[ tuple[ 0 ] + "With" ](
													this,
													fn ? [ returned ] : arguments
												);
											}
										} );
									} );
									fns = null;
								} ).promise();
							},
							then: function( onFulfilled, onRejected, onProgress ) {
								var maxDepth = 0;
								function resolve( depth, deferred, handler, special ) {
									return function() {
										var that = this,
											args = arguments,
											mightThrow = function() {
												var returned, then;

												// Support: Promises/A+ section 2.3.3.3.3
												// https://promisesaplus.com/#point-59
												// Ignore double-resolution attempts
												if ( depth < maxDepth ) {
													return;
												}

												returned = handler.apply( that, args );

												// Support: Promises/A+ section 2.3.1
												// https://promisesaplus.com/#point-48
												if ( returned === deferred.promise() ) {
													throw new TypeError( "Thenable self-resolution" );
												}

												// Support: Promises/A+ sections 2.3.3.1, 3.5
												// https://promisesaplus.com/#point-54
												// https://promisesaplus.com/#point-75
												// Retrieve `then` only once
												then = returned &&

													// Support: Promises/A+ section 2.3.4
													// https://promisesaplus.com/#point-64
													// Only check objects and functions for thenability
													( typeof returned === "object" ||
														typeof returned === "function" ) &&
													returned.then;

												// Handle a returned thenable
												if ( isFunction( then ) ) {

													// Special processors (notify) just wait for resolution
													if ( special ) {
														then.call(
															returned,
															resolve( maxDepth, deferred, Identity, special ),
															resolve( maxDepth, deferred, Thrower, special )
														);

													// Normal processors (resolve) also hook into progress
													} else {

														// ...and disregard older resolution values
														maxDepth++;

														then.call(
															returned,
															resolve( maxDepth, deferred, Identity, special ),
															resolve( maxDepth, deferred, Thrower, special ),
															resolve( maxDepth, deferred, Identity,
																deferred.notifyWith )
														);
													}

												// Handle all other returned values
												} else {

													// Only substitute handlers pass on context
													// and multiple values (non-spec behavior)
													if ( handler !== Identity ) {
														that = undefined;
														args = [ returned ];
													}

													// Process the value(s)
													// Default process is resolve
													( special || deferred.resolveWith )( that, args );
												}
											},

											// Only normal processors (resolve) catch and reject exceptions
											process = special ?
												mightThrow :
												function() {
													try {
														mightThrow();
													} catch ( e ) {

														if ( jQuery.Deferred.exceptionHook ) {
															jQuery.Deferred.exceptionHook( e,
																process.error );
														}

														// Support: Promises/A+ section 2.3.3.3.4.1
														// https://promisesaplus.com/#point-61
														// Ignore post-resolution exceptions
														if ( depth + 1 >= maxDepth ) {

															// Only substitute handlers pass on context
															// and multiple values (non-spec behavior)
															if ( handler !== Thrower ) {
																that = undefined;
																args = [ e ];
															}

															deferred.rejectWith( that, args );
														}
													}
												};

										// Support: Promises/A+ section 2.3.3.3.1
										// https://promisesaplus.com/#point-57
										// Re-resolve promises immediately to dodge false rejection from
										// subsequent errors
										if ( depth ) {
											process();
										} else {

											// Call an optional hook to record the error, in case of exception
											// since it's otherwise lost when execution goes async
											if ( jQuery.Deferred.getErrorHook ) {
												process.error = jQuery.Deferred.getErrorHook();

											// The deprecated alias of the above. While the name suggests
											// returning the stack, not an error instance, jQuery just passes
											// it directly to `console.warn` so both will work; an instance
											// just better cooperates with source maps.
											} else if ( jQuery.Deferred.getStackHook ) {
												process.error = jQuery.Deferred.getStackHook();
											}
											window.setTimeout( process );
										}
									};
								}

								return jQuery.Deferred( function( newDefer ) {

									// progress_handlers.add( ... )
									tuples[ 0 ][ 3 ].add(
										resolve(
											0,
											newDefer,
											isFunction( onProgress ) ?
												onProgress :
												Identity,
											newDefer.notifyWith
										)
									);

									// fulfilled_handlers.add( ... )
									tuples[ 1 ][ 3 ].add(
										resolve(
											0,
											newDefer,
											isFunction( onFulfilled ) ?
												onFulfilled :
												Identity
										)
									);

									// rejected_handlers.add( ... )
									tuples[ 2 ][ 3 ].add(
										resolve(
											0,
											newDefer,
											isFunction( onRejected ) ?
												onRejected :
												Thrower
										)
									);
								} ).promise();
							},

							// Get a promise for this deferred
							// If obj is provided, the promise aspect is added to the object
							promise: function( obj ) {
								return obj != null ? jQuery.extend( obj, promise ) : promise;
							}
						},
						deferred = {};

					// Add list-specific methods
					jQuery.each( tuples, function( i, tuple ) {
						var list = tuple[ 2 ],
							stateString = tuple[ 5 ];

						// promise.progress = list.add
						// promise.done = list.add
						// promise.fail = list.add
						promise[ tuple[ 1 ] ] = list.add;

						// Handle state
						if ( stateString ) {
							list.add(
								function() {

									// state = "resolved" (i.e., fulfilled)
									// state = "rejected"
									state = stateString;
								},

								// rejected_callbacks.disable
								// fulfilled_callbacks.disable
								tuples[ 3 - i ][ 2 ].disable,

								// rejected_handlers.disable
								// fulfilled_handlers.disable
								tuples[ 3 - i ][ 3 ].disable,

								// progress_callbacks.lock
								tuples[ 0 ][ 2 ].lock,

								// progress_handlers.lock
								tuples[ 0 ][ 3 ].lock
							);
						}

						// progress_handlers.fire
						// fulfilled_handlers.fire
						// rejected_handlers.fire
						list.add( tuple[ 3 ].fire );

						// deferred.notify = function() { deferred.notifyWith(...) }
						// deferred.resolve = function() { deferred.resolveWith(...) }
						// deferred.reject = function() { deferred.rejectWith(...) }
						deferred[ tuple[ 0 ] ] = function() {
							deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
							return this;
						};

						// deferred.notifyWith = list.fireWith
						// deferred.resolveWith = list.fireWith
						// deferred.rejectWith = list.fireWith
						deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
					} );

					// Make the deferred a promise
					promise.promise( deferred );

					// Call given func if any
					if ( func ) {
						func.call( deferred, deferred );
					}

					// All done!
					return deferred;
				},

				// Deferred helper
				when: function( singleValue ) {
					var

						// count of uncompleted subordinates
						remaining = arguments.length,

						// count of unprocessed arguments
						i = remaining,

						// subordinate fulfillment data
						resolveContexts = Array( i ),
						resolveValues = slice.call( arguments ),

						// the primary Deferred
						primary = jQuery.Deferred(),

						// subordinate callback factory
						updateFunc = function( i ) {
							return function( value ) {
								resolveContexts[ i ] = this;
								resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
								if ( !( --remaining ) ) {
									primary.resolveWith( resolveContexts, resolveValues );
								}
							};
						};

					// Single- and empty arguments are adopted like Promise.resolve
					if ( remaining <= 1 ) {
						adoptValue( singleValue, primary.done( updateFunc( i ) ).resolve, primary.reject,
							!remaining );

						// Use .then() to unwrap secondary thenables (cf. gh-3000)
						if ( primary.state() === "pending" ||
							isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

							return primary.then();
						}
					}

					// Multiple arguments are aggregated like Promise.all array elements
					while ( i-- ) {
						adoptValue( resolveValues[ i ], updateFunc( i ), primary.reject );
					}

					return primary.promise();
				}
			} );


			// These usually indicate a programmer mistake during development,
			// warn about them ASAP rather than swallowing them by default.
			var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

			// If `jQuery.Deferred.getErrorHook` is defined, `asyncError` is an error
			// captured before the async barrier to get the original error cause
			// which may otherwise be hidden.
			jQuery.Deferred.exceptionHook = function( error, asyncError ) {

				// Support: IE 8 - 9 only
				// Console exists when dev tools are open, which can happen at any time
				if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
					window.console.warn( "jQuery.Deferred exception: " + error.message,
						error.stack, asyncError );
				}
			};




			jQuery.readyException = function( error ) {
				window.setTimeout( function() {
					throw error;
				} );
			};




			// The deferred used on DOM ready
			var readyList = jQuery.Deferred();

			jQuery.fn.ready = function( fn ) {

				readyList
					.then( fn )

					// Wrap jQuery.readyException in a function so that the lookup
					// happens at the time of error handling instead of callback
					// registration.
					.catch( function( error ) {
						jQuery.readyException( error );
					} );

				return this;
			};

			jQuery.extend( {

				// Is the DOM ready to be used? Set to true once it occurs.
				isReady: false,

				// A counter to track how many items to wait for before
				// the ready event fires. See trac-6781
				readyWait: 1,

				// Handle when the DOM is ready
				ready: function( wait ) {

					// Abort if there are pending holds or we're already ready
					if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
						return;
					}

					// Remember that the DOM is ready
					jQuery.isReady = true;

					// If a normal DOM Ready event fired, decrement, and wait if need be
					if ( wait !== true && --jQuery.readyWait > 0 ) {
						return;
					}

					// If there are functions bound, to execute
					readyList.resolveWith( document, [ jQuery ] );
				}
			} );

			jQuery.ready.then = readyList.then;

			// The ready event handler and self cleanup method
			function completed() {
				document.removeEventListener( "DOMContentLoaded", completed );
				window.removeEventListener( "load", completed );
				jQuery.ready();
			}

			// Catch cases where $(document).ready() is called
			// after the browser event has already occurred.
			// Support: IE <=9 - 10 only
			// Older IE sometimes signals "interactive" too soon
			if ( document.readyState === "complete" ||
				( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

				// Handle it asynchronously to allow scripts the opportunity to delay ready
				window.setTimeout( jQuery.ready );

			} else {

				// Use the handy event callback
				document.addEventListener( "DOMContentLoaded", completed );

				// A fallback to window.onload, that will always work
				window.addEventListener( "load", completed );
			}




			// Multifunctional method to get and set values of a collection
			// The value/s can optionally be executed if it's a function
			var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
				var i = 0,
					len = elems.length,
					bulk = key == null;

				// Sets many values
				if ( toType( key ) === "object" ) {
					chainable = true;
					for ( i in key ) {
						access( elems, fn, i, key[ i ], true, emptyGet, raw );
					}

				// Sets one value
				} else if ( value !== undefined ) {
					chainable = true;

					if ( !isFunction( value ) ) {
						raw = true;
					}

					if ( bulk ) {

						// Bulk operations run against the entire set
						if ( raw ) {
							fn.call( elems, value );
							fn = null;

						// ...except when executing function values
						} else {
							bulk = fn;
							fn = function( elem, _key, value ) {
								return bulk.call( jQuery( elem ), value );
							};
						}
					}

					if ( fn ) {
						for ( ; i < len; i++ ) {
							fn(
								elems[ i ], key, raw ?
									value :
									value.call( elems[ i ], i, fn( elems[ i ], key ) )
							);
						}
					}
				}

				if ( chainable ) {
					return elems;
				}

				// Gets
				if ( bulk ) {
					return fn.call( elems );
				}

				return len ? fn( elems[ 0 ], key ) : emptyGet;
			};


			// Matches dashed string for camelizing
			var rmsPrefix = /^-ms-/,
				rdashAlpha = /-([a-z])/g;

			// Used by camelCase as callback to replace()
			function fcamelCase( _all, letter ) {
				return letter.toUpperCase();
			}

			// Convert dashed to camelCase; used by the css and data modules
			// Support: IE <=9 - 11, Edge 12 - 15
			// Microsoft forgot to hump their vendor prefix (trac-9572)
			function camelCase( string ) {
				return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
			}
			var acceptData = function( owner ) {

				// Accepts only:
				//  - Node
				//    - Node.ELEMENT_NODE
				//    - Node.DOCUMENT_NODE
				//  - Object
				//    - Any
				return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
			};




			function Data() {
				this.expando = jQuery.expando + Data.uid++;
			}

			Data.uid = 1;

			Data.prototype = {

				cache: function( owner ) {

					// Check if the owner object already has a cache
					var value = owner[ this.expando ];

					// If not, create one
					if ( !value ) {
						value = {};

						// We can accept data for non-element nodes in modern browsers,
						// but we should not, see trac-8335.
						// Always return an empty object.
						if ( acceptData( owner ) ) {

							// If it is a node unlikely to be stringify-ed or looped over
							// use plain assignment
							if ( owner.nodeType ) {
								owner[ this.expando ] = value;

							// Otherwise secure it in a non-enumerable property
							// configurable must be true to allow the property to be
							// deleted when data is removed
							} else {
								Object.defineProperty( owner, this.expando, {
									value: value,
									configurable: true
								} );
							}
						}
					}

					return value;
				},
				set: function( owner, data, value ) {
					var prop,
						cache = this.cache( owner );

					// Handle: [ owner, key, value ] args
					// Always use camelCase key (gh-2257)
					if ( typeof data === "string" ) {
						cache[ camelCase( data ) ] = value;

					// Handle: [ owner, { properties } ] args
					} else {

						// Copy the properties one-by-one to the cache object
						for ( prop in data ) {
							cache[ camelCase( prop ) ] = data[ prop ];
						}
					}
					return cache;
				},
				get: function( owner, key ) {
					return key === undefined ?
						this.cache( owner ) :

						// Always use camelCase key (gh-2257)
						owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
				},
				access: function( owner, key, value ) {

					// In cases where either:
					//
					//   1. No key was specified
					//   2. A string key was specified, but no value provided
					//
					// Take the "read" path and allow the get method to determine
					// which value to return, respectively either:
					//
					//   1. The entire cache object
					//   2. The data stored at the key
					//
					if ( key === undefined ||
							( ( key && typeof key === "string" ) && value === undefined ) ) {

						return this.get( owner, key );
					}

					// When the key is not a string, or both a key and value
					// are specified, set or extend (existing objects) with either:
					//
					//   1. An object of properties
					//   2. A key and value
					//
					this.set( owner, key, value );

					// Since the "set" path can have two possible entry points
					// return the expected data based on which path was taken[*]
					return value !== undefined ? value : key;
				},
				remove: function( owner, key ) {
					var i,
						cache = owner[ this.expando ];

					if ( cache === undefined ) {
						return;
					}

					if ( key !== undefined ) {

						// Support array or space separated string of keys
						if ( Array.isArray( key ) ) {

							// If key is an array of keys...
							// We always set camelCase keys, so remove that.
							key = key.map( camelCase );
						} else {
							key = camelCase( key );

							// If a key with the spaces exists, use it.
							// Otherwise, create an array by matching non-whitespace
							key = key in cache ?
								[ key ] :
								( key.match( rnothtmlwhite ) || [] );
						}

						i = key.length;

						while ( i-- ) {
							delete cache[ key[ i ] ];
						}
					}

					// Remove the expando if there's no more data
					if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

						// Support: Chrome <=35 - 45
						// Webkit & Blink performance suffers when deleting properties
						// from DOM nodes, so set to undefined instead
						// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
						if ( owner.nodeType ) {
							owner[ this.expando ] = undefined;
						} else {
							delete owner[ this.expando ];
						}
					}
				},
				hasData: function( owner ) {
					var cache = owner[ this.expando ];
					return cache !== undefined && !jQuery.isEmptyObject( cache );
				}
			};
			var dataPriv = new Data();

			var dataUser = new Data();



			//	Implementation Summary
			//
			//	1. Enforce API surface and semantic compatibility with 1.9.x branch
			//	2. Improve the module's maintainability by reducing the storage
			//		paths to a single mechanism.
			//	3. Use the same single mechanism to support "private" and "user" data.
			//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
			//	5. Avoid exposing implementation details on user objects (eg. expando properties)
			//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

			var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
				rmultiDash = /[A-Z]/g;

			function getData( data ) {
				if ( data === "true" ) {
					return true;
				}

				if ( data === "false" ) {
					return false;
				}

				if ( data === "null" ) {
					return null;
				}

				// Only convert to a number if it doesn't change the string
				if ( data === +data + "" ) {
					return +data;
				}

				if ( rbrace.test( data ) ) {
					return JSON.parse( data );
				}

				return data;
			}

			function dataAttr( elem, key, data ) {
				var name;

				// If nothing was found internally, try to fetch any
				// data from the HTML5 data-* attribute
				if ( data === undefined && elem.nodeType === 1 ) {
					name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
					data = elem.getAttribute( name );

					if ( typeof data === "string" ) {
						try {
							data = getData( data );
						} catch ( e ) {}

						// Make sure we set the data so it isn't changed later
						dataUser.set( elem, key, data );
					} else {
						data = undefined;
					}
				}
				return data;
			}

			jQuery.extend( {
				hasData: function( elem ) {
					return dataUser.hasData( elem ) || dataPriv.hasData( elem );
				},

				data: function( elem, name, data ) {
					return dataUser.access( elem, name, data );
				},

				removeData: function( elem, name ) {
					dataUser.remove( elem, name );
				},

				// TODO: Now that all calls to _data and _removeData have been replaced
				// with direct calls to dataPriv methods, these can be deprecated.
				_data: function( elem, name, data ) {
					return dataPriv.access( elem, name, data );
				},

				_removeData: function( elem, name ) {
					dataPriv.remove( elem, name );
				}
			} );

			jQuery.fn.extend( {
				data: function( key, value ) {
					var i, name, data,
						elem = this[ 0 ],
						attrs = elem && elem.attributes;

					// Gets all values
					if ( key === undefined ) {
						if ( this.length ) {
							data = dataUser.get( elem );

							if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
								i = attrs.length;
								while ( i-- ) {

									// Support: IE 11 only
									// The attrs elements can be null (trac-14894)
									if ( attrs[ i ] ) {
										name = attrs[ i ].name;
										if ( name.indexOf( "data-" ) === 0 ) {
											name = camelCase( name.slice( 5 ) );
											dataAttr( elem, name, data[ name ] );
										}
									}
								}
								dataPriv.set( elem, "hasDataAttrs", true );
							}
						}

						return data;
					}

					// Sets multiple values
					if ( typeof key === "object" ) {
						return this.each( function() {
							dataUser.set( this, key );
						} );
					}

					return access( this, function( value ) {
						var data;

						// The calling jQuery object (element matches) is not empty
						// (and therefore has an element appears at this[ 0 ]) and the
						// `value` parameter was not undefined. An empty jQuery object
						// will result in `undefined` for elem = this[ 0 ] which will
						// throw an exception if an attempt to read a data cache is made.
						if ( elem && value === undefined ) {

							// Attempt to get data from the cache
							// The key will always be camelCased in Data
							data = dataUser.get( elem, key );
							if ( data !== undefined ) {
								return data;
							}

							// Attempt to "discover" the data in
							// HTML5 custom data-* attrs
							data = dataAttr( elem, key );
							if ( data !== undefined ) {
								return data;
							}

							// We tried really hard, but the data doesn't exist.
							return;
						}

						// Set the data...
						this.each( function() {

							// We always store the camelCased key
							dataUser.set( this, key, value );
						} );
					}, null, value, arguments.length > 1, null, true );
				},

				removeData: function( key ) {
					return this.each( function() {
						dataUser.remove( this, key );
					} );
				}
			} );


			jQuery.extend( {
				queue: function( elem, type, data ) {
					var queue;

					if ( elem ) {
						type = ( type || "fx" ) + "queue";
						queue = dataPriv.get( elem, type );

						// Speed up dequeue by getting out quickly if this is just a lookup
						if ( data ) {
							if ( !queue || Array.isArray( data ) ) {
								queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
							} else {
								queue.push( data );
							}
						}
						return queue || [];
					}
				},

				dequeue: function( elem, type ) {
					type = type || "fx";

					var queue = jQuery.queue( elem, type ),
						startLength = queue.length,
						fn = queue.shift(),
						hooks = jQuery._queueHooks( elem, type ),
						next = function() {
							jQuery.dequeue( elem, type );
						};

					// If the fx queue is dequeued, always remove the progress sentinel
					if ( fn === "inprogress" ) {
						fn = queue.shift();
						startLength--;
					}

					if ( fn ) {

						// Add a progress sentinel to prevent the fx queue from being
						// automatically dequeued
						if ( type === "fx" ) {
							queue.unshift( "inprogress" );
						}

						// Clear up the last queue stop function
						delete hooks.stop;
						fn.call( elem, next, hooks );
					}

					if ( !startLength && hooks ) {
						hooks.empty.fire();
					}
				},

				// Not public - generate a queueHooks object, or return the current one
				_queueHooks: function( elem, type ) {
					var key = type + "queueHooks";
					return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
						empty: jQuery.Callbacks( "once memory" ).add( function() {
							dataPriv.remove( elem, [ type + "queue", key ] );
						} )
					} );
				}
			} );

			jQuery.fn.extend( {
				queue: function( type, data ) {
					var setter = 2;

					if ( typeof type !== "string" ) {
						data = type;
						type = "fx";
						setter--;
					}

					if ( arguments.length < setter ) {
						return jQuery.queue( this[ 0 ], type );
					}

					return data === undefined ?
						this :
						this.each( function() {
							var queue = jQuery.queue( this, type, data );

							// Ensure a hooks for this queue
							jQuery._queueHooks( this, type );

							if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
								jQuery.dequeue( this, type );
							}
						} );
				},
				dequeue: function( type ) {
					return this.each( function() {
						jQuery.dequeue( this, type );
					} );
				},
				clearQueue: function( type ) {
					return this.queue( type || "fx", [] );
				},

				// Get a promise resolved when queues of a certain type
				// are emptied (fx is the type by default)
				promise: function( type, obj ) {
					var tmp,
						count = 1,
						defer = jQuery.Deferred(),
						elements = this,
						i = this.length,
						resolve = function() {
							if ( !( --count ) ) {
								defer.resolveWith( elements, [ elements ] );
							}
						};

					if ( typeof type !== "string" ) {
						obj = type;
						type = undefined;
					}
					type = type || "fx";

					while ( i-- ) {
						tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
						if ( tmp && tmp.empty ) {
							count++;
							tmp.empty.add( resolve );
						}
					}
					resolve();
					return defer.promise( obj );
				}
			} );
			var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

			var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


			var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

			var documentElement = document.documentElement;



				var isAttached = function( elem ) {
						return jQuery.contains( elem.ownerDocument, elem );
					},
					composed = { composed: true };

				// Support: IE 9 - 11+, Edge 12 - 18+, iOS 10.0 - 10.2 only
				// Check attachment across shadow DOM boundaries when possible (gh-3504)
				// Support: iOS 10.0-10.2 only
				// Early iOS 10 versions support `attachShadow` but not `getRootNode`,
				// leading to errors. We need to check for `getRootNode`.
				if ( documentElement.getRootNode ) {
					isAttached = function( elem ) {
						return jQuery.contains( elem.ownerDocument, elem ) ||
							elem.getRootNode( composed ) === elem.ownerDocument;
					};
				}
			var isHiddenWithinTree = function( elem, el ) {

					// isHiddenWithinTree might be called from jQuery#filter function;
					// in that case, element will be second argument
					elem = el || elem;

					// Inline style trumps all
					return elem.style.display === "none" ||
						elem.style.display === "" &&

						// Otherwise, check computed style
						// Support: Firefox <=43 - 45
						// Disconnected elements can have computed display: none, so first confirm that elem is
						// in the document.
						isAttached( elem ) &&

						jQuery.css( elem, "display" ) === "none";
				};



			function adjustCSS( elem, prop, valueParts, tween ) {
				var adjusted, scale,
					maxIterations = 20,
					currentValue = tween ?
						function() {
							return tween.cur();
						} :
						function() {
							return jQuery.css( elem, prop, "" );
						},
					initial = currentValue(),
					unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

					// Starting value computation is required for potential unit mismatches
					initialInUnit = elem.nodeType &&
						( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
						rcssNum.exec( jQuery.css( elem, prop ) );

				if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

					// Support: Firefox <=54
					// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
					initial = initial / 2;

					// Trust units reported by jQuery.css
					unit = unit || initialInUnit[ 3 ];

					// Iteratively approximate from a nonzero starting point
					initialInUnit = +initial || 1;

					while ( maxIterations-- ) {

						// Evaluate and update our best guess (doubling guesses that zero out).
						// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
						jQuery.style( elem, prop, initialInUnit + unit );
						if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
							maxIterations = 0;
						}
						initialInUnit = initialInUnit / scale;

					}

					initialInUnit = initialInUnit * 2;
					jQuery.style( elem, prop, initialInUnit + unit );

					// Make sure we update the tween properties later on
					valueParts = valueParts || [];
				}

				if ( valueParts ) {
					initialInUnit = +initialInUnit || +initial || 0;

					// Apply relative offset (+=/-=) if specified
					adjusted = valueParts[ 1 ] ?
						initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
						+valueParts[ 2 ];
					if ( tween ) {
						tween.unit = unit;
						tween.start = initialInUnit;
						tween.end = adjusted;
					}
				}
				return adjusted;
			}


			var defaultDisplayMap = {};

			function getDefaultDisplay( elem ) {
				var temp,
					doc = elem.ownerDocument,
					nodeName = elem.nodeName,
					display = defaultDisplayMap[ nodeName ];

				if ( display ) {
					return display;
				}

				temp = doc.body.appendChild( doc.createElement( nodeName ) );
				display = jQuery.css( temp, "display" );

				temp.parentNode.removeChild( temp );

				if ( display === "none" ) {
					display = "block";
				}
				defaultDisplayMap[ nodeName ] = display;

				return display;
			}

			function showHide( elements, show ) {
				var display, elem,
					values = [],
					index = 0,
					length = elements.length;

				// Determine new display value for elements that need to change
				for ( ; index < length; index++ ) {
					elem = elements[ index ];
					if ( !elem.style ) {
						continue;
					}

					display = elem.style.display;
					if ( show ) {

						// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
						// check is required in this first loop unless we have a nonempty display value (either
						// inline or about-to-be-restored)
						if ( display === "none" ) {
							values[ index ] = dataPriv.get( elem, "display" ) || null;
							if ( !values[ index ] ) {
								elem.style.display = "";
							}
						}
						if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
							values[ index ] = getDefaultDisplay( elem );
						}
					} else {
						if ( display !== "none" ) {
							values[ index ] = "none";

							// Remember what we're overwriting
							dataPriv.set( elem, "display", display );
						}
					}
				}

				// Set the display of the elements in a second loop to avoid constant reflow
				for ( index = 0; index < length; index++ ) {
					if ( values[ index ] != null ) {
						elements[ index ].style.display = values[ index ];
					}
				}

				return elements;
			}

			jQuery.fn.extend( {
				show: function() {
					return showHide( this, true );
				},
				hide: function() {
					return showHide( this );
				},
				toggle: function( state ) {
					if ( typeof state === "boolean" ) {
						return state ? this.show() : this.hide();
					}

					return this.each( function() {
						if ( isHiddenWithinTree( this ) ) {
							jQuery( this ).show();
						} else {
							jQuery( this ).hide();
						}
					} );
				}
			} );
			var rcheckableType = ( /^(?:checkbox|radio)$/i );

			var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]*)/i );

			var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



			( function() {
				var fragment = document.createDocumentFragment(),
					div = fragment.appendChild( document.createElement( "div" ) ),
					input = document.createElement( "input" );

				// Support: Android 4.0 - 4.3 only
				// Check state lost if the name is set (trac-11217)
				// Support: Windows Web Apps (WWA)
				// `name` and `type` must use .setAttribute for WWA (trac-14901)
				input.setAttribute( "type", "radio" );
				input.setAttribute( "checked", "checked" );
				input.setAttribute( "name", "t" );

				div.appendChild( input );

				// Support: Android <=4.1 only
				// Older WebKit doesn't clone checked state correctly in fragments
				support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

				// Support: IE <=11 only
				// Make sure textarea (and checkbox) defaultValue is properly cloned
				div.innerHTML = "<textarea>x</textarea>";
				support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

				// Support: IE <=9 only
				// IE <=9 replaces <option> tags with their contents when inserted outside of
				// the select element.
				div.innerHTML = "<option></option>";
				support.option = !!div.lastChild;
			} )();


			// We have to close these tags to support XHTML (trac-13200)
			var wrapMap = {

				// XHTML parsers do not magically insert elements in the
				// same way that tag soup parsers do. So we cannot shorten
				// this by omitting <tbody> or other required elements.
				thead: [ 1, "<table>", "</table>" ],
				col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
				tr: [ 2, "<table><tbody>", "</tbody></table>" ],
				td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

				_default: [ 0, "", "" ]
			};

			wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
			wrapMap.th = wrapMap.td;

			// Support: IE <=9 only
			if ( !support.option ) {
				wrapMap.optgroup = wrapMap.option = [ 1, "<select multiple='multiple'>", "</select>" ];
			}


			function getAll( context, tag ) {

				// Support: IE <=9 - 11 only
				// Use typeof to avoid zero-argument method invocation on host objects (trac-15151)
				var ret;

				if ( typeof context.getElementsByTagName !== "undefined" ) {
					ret = context.getElementsByTagName( tag || "*" );

				} else if ( typeof context.querySelectorAll !== "undefined" ) {
					ret = context.querySelectorAll( tag || "*" );

				} else {
					ret = [];
				}

				if ( tag === undefined || tag && nodeName( context, tag ) ) {
					return jQuery.merge( [ context ], ret );
				}

				return ret;
			}


			// Mark scripts as having already been evaluated
			function setGlobalEval( elems, refElements ) {
				var i = 0,
					l = elems.length;

				for ( ; i < l; i++ ) {
					dataPriv.set(
						elems[ i ],
						"globalEval",
						!refElements || dataPriv.get( refElements[ i ], "globalEval" )
					);
				}
			}


			var rhtml = /<|&#?\w+;/;

			function buildFragment( elems, context, scripts, selection, ignored ) {
				var elem, tmp, tag, wrap, attached, j,
					fragment = context.createDocumentFragment(),
					nodes = [],
					i = 0,
					l = elems.length;

				for ( ; i < l; i++ ) {
					elem = elems[ i ];

					if ( elem || elem === 0 ) {

						// Add nodes directly
						if ( toType( elem ) === "object" ) {

							// Support: Android <=4.0 only, PhantomJS 1 only
							// push.apply(_, arraylike) throws on ancient WebKit
							jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

						// Convert non-html into a text node
						} else if ( !rhtml.test( elem ) ) {
							nodes.push( context.createTextNode( elem ) );

						// Convert html into DOM nodes
						} else {
							tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

							// Deserialize a standard representation
							tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
							wrap = wrapMap[ tag ] || wrapMap._default;
							tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

							// Descend through wrappers to the right content
							j = wrap[ 0 ];
							while ( j-- ) {
								tmp = tmp.lastChild;
							}

							// Support: Android <=4.0 only, PhantomJS 1 only
							// push.apply(_, arraylike) throws on ancient WebKit
							jQuery.merge( nodes, tmp.childNodes );

							// Remember the top-level container
							tmp = fragment.firstChild;

							// Ensure the created nodes are orphaned (trac-12392)
							tmp.textContent = "";
						}
					}
				}

				// Remove wrapper from fragment
				fragment.textContent = "";

				i = 0;
				while ( ( elem = nodes[ i++ ] ) ) {

					// Skip elements already in the context collection (trac-4087)
					if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
						if ( ignored ) {
							ignored.push( elem );
						}
						continue;
					}

					attached = isAttached( elem );

					// Append to fragment
					tmp = getAll( fragment.appendChild( elem ), "script" );

					// Preserve script evaluation history
					if ( attached ) {
						setGlobalEval( tmp );
					}

					// Capture executables
					if ( scripts ) {
						j = 0;
						while ( ( elem = tmp[ j++ ] ) ) {
							if ( rscriptType.test( elem.type || "" ) ) {
								scripts.push( elem );
							}
						}
					}
				}

				return fragment;
			}


			var rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

			function returnTrue() {
				return true;
			}

			function returnFalse() {
				return false;
			}

			function on( elem, types, selector, data, fn, one ) {
				var origFn, type;

				// Types can be a map of types/handlers
				if ( typeof types === "object" ) {

					// ( types-Object, selector, data )
					if ( typeof selector !== "string" ) {

						// ( types-Object, data )
						data = data || selector;
						selector = undefined;
					}
					for ( type in types ) {
						on( elem, type, selector, data, types[ type ], one );
					}
					return elem;
				}

				if ( data == null && fn == null ) {

					// ( types, fn )
					fn = selector;
					data = selector = undefined;
				} else if ( fn == null ) {
					if ( typeof selector === "string" ) {

						// ( types, selector, fn )
						fn = data;
						data = undefined;
					} else {

						// ( types, data, fn )
						fn = data;
						data = selector;
						selector = undefined;
					}
				}
				if ( fn === false ) {
					fn = returnFalse;
				} else if ( !fn ) {
					return elem;
				}

				if ( one === 1 ) {
					origFn = fn;
					fn = function( event ) {

						// Can use an empty set, since event contains the info
						jQuery().off( event );
						return origFn.apply( this, arguments );
					};

					// Use same guid so caller can remove using origFn
					fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
				}
				return elem.each( function() {
					jQuery.event.add( this, types, fn, data, selector );
				} );
			}

			/*
			 * Helper functions for managing events -- not part of the public interface.
			 * Props to Dean Edwards' addEvent library for many of the ideas.
			 */
			jQuery.event = {

				global: {},

				add: function( elem, types, handler, data, selector ) {

					var handleObjIn, eventHandle, tmp,
						events, t, handleObj,
						special, handlers, type, namespaces, origType,
						elemData = dataPriv.get( elem );

					// Only attach events to objects that accept data
					if ( !acceptData( elem ) ) {
						return;
					}

					// Caller can pass in an object of custom data in lieu of the handler
					if ( handler.handler ) {
						handleObjIn = handler;
						handler = handleObjIn.handler;
						selector = handleObjIn.selector;
					}

					// Ensure that invalid selectors throw exceptions at attach time
					// Evaluate against documentElement in case elem is a non-element node (e.g., document)
					if ( selector ) {
						jQuery.find.matchesSelector( documentElement, selector );
					}

					// Make sure that the handler has a unique ID, used to find/remove it later
					if ( !handler.guid ) {
						handler.guid = jQuery.guid++;
					}

					// Init the element's event structure and main handler, if this is the first
					if ( !( events = elemData.events ) ) {
						events = elemData.events = Object.create( null );
					}
					if ( !( eventHandle = elemData.handle ) ) {
						eventHandle = elemData.handle = function( e ) {

							// Discard the second event of a jQuery.event.trigger() and
							// when an event is called after a page has unloaded
							return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
								jQuery.event.dispatch.apply( elem, arguments ) : undefined;
						};
					}

					// Handle multiple events separated by a space
					types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
					t = types.length;
					while ( t-- ) {
						tmp = rtypenamespace.exec( types[ t ] ) || [];
						type = origType = tmp[ 1 ];
						namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

						// There *must* be a type, no attaching namespace-only handlers
						if ( !type ) {
							continue;
						}

						// If event changes its type, use the special event handlers for the changed type
						special = jQuery.event.special[ type ] || {};

						// If selector defined, determine special event api type, otherwise given type
						type = ( selector ? special.delegateType : special.bindType ) || type;

						// Update special based on newly reset type
						special = jQuery.event.special[ type ] || {};

						// handleObj is passed to all event handlers
						handleObj = jQuery.extend( {
							type: type,
							origType: origType,
							data: data,
							handler: handler,
							guid: handler.guid,
							selector: selector,
							needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
							namespace: namespaces.join( "." )
						}, handleObjIn );

						// Init the event handler queue if we're the first
						if ( !( handlers = events[ type ] ) ) {
							handlers = events[ type ] = [];
							handlers.delegateCount = 0;

							// Only use addEventListener if the special events handler returns false
							if ( !special.setup ||
								special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

								if ( elem.addEventListener ) {
									elem.addEventListener( type, eventHandle );
								}
							}
						}

						if ( special.add ) {
							special.add.call( elem, handleObj );

							if ( !handleObj.handler.guid ) {
								handleObj.handler.guid = handler.guid;
							}
						}

						// Add to the element's handler list, delegates in front
						if ( selector ) {
							handlers.splice( handlers.delegateCount++, 0, handleObj );
						} else {
							handlers.push( handleObj );
						}

						// Keep track of which events have ever been used, for event optimization
						jQuery.event.global[ type ] = true;
					}

				},

				// Detach an event or set of events from an element
				remove: function( elem, types, handler, selector, mappedTypes ) {

					var j, origCount, tmp,
						events, t, handleObj,
						special, handlers, type, namespaces, origType,
						elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

					if ( !elemData || !( events = elemData.events ) ) {
						return;
					}

					// Once for each type.namespace in types; type may be omitted
					types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
					t = types.length;
					while ( t-- ) {
						tmp = rtypenamespace.exec( types[ t ] ) || [];
						type = origType = tmp[ 1 ];
						namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

						// Unbind all events (on this namespace, if provided) for the element
						if ( !type ) {
							for ( type in events ) {
								jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
							}
							continue;
						}

						special = jQuery.event.special[ type ] || {};
						type = ( selector ? special.delegateType : special.bindType ) || type;
						handlers = events[ type ] || [];
						tmp = tmp[ 2 ] &&
							new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

						// Remove matching events
						origCount = j = handlers.length;
						while ( j-- ) {
							handleObj = handlers[ j ];

							if ( ( mappedTypes || origType === handleObj.origType ) &&
								( !handler || handler.guid === handleObj.guid ) &&
								( !tmp || tmp.test( handleObj.namespace ) ) &&
								( !selector || selector === handleObj.selector ||
									selector === "**" && handleObj.selector ) ) {
								handlers.splice( j, 1 );

								if ( handleObj.selector ) {
									handlers.delegateCount--;
								}
								if ( special.remove ) {
									special.remove.call( elem, handleObj );
								}
							}
						}

						// Remove generic event handler if we removed something and no more handlers exist
						// (avoids potential for endless recursion during removal of special event handlers)
						if ( origCount && !handlers.length ) {
							if ( !special.teardown ||
								special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

								jQuery.removeEvent( elem, type, elemData.handle );
							}

							delete events[ type ];
						}
					}

					// Remove data and the expando if it's no longer used
					if ( jQuery.isEmptyObject( events ) ) {
						dataPriv.remove( elem, "handle events" );
					}
				},

				dispatch: function( nativeEvent ) {

					var i, j, ret, matched, handleObj, handlerQueue,
						args = new Array( arguments.length ),

						// Make a writable jQuery.Event from the native event object
						event = jQuery.event.fix( nativeEvent ),

						handlers = (
							dataPriv.get( this, "events" ) || Object.create( null )
						)[ event.type ] || [],
						special = jQuery.event.special[ event.type ] || {};

					// Use the fix-ed jQuery.Event rather than the (read-only) native event
					args[ 0 ] = event;

					for ( i = 1; i < arguments.length; i++ ) {
						args[ i ] = arguments[ i ];
					}

					event.delegateTarget = this;

					// Call the preDispatch hook for the mapped type, and let it bail if desired
					if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
						return;
					}

					// Determine handlers
					handlerQueue = jQuery.event.handlers.call( this, event, handlers );

					// Run delegates first; they may want to stop propagation beneath us
					i = 0;
					while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
						event.currentTarget = matched.elem;

						j = 0;
						while ( ( handleObj = matched.handlers[ j++ ] ) &&
							!event.isImmediatePropagationStopped() ) {

							// If the event is namespaced, then each handler is only invoked if it is
							// specially universal or its namespaces are a superset of the event's.
							if ( !event.rnamespace || handleObj.namespace === false ||
								event.rnamespace.test( handleObj.namespace ) ) {

								event.handleObj = handleObj;
								event.data = handleObj.data;

								ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
									handleObj.handler ).apply( matched.elem, args );

								if ( ret !== undefined ) {
									if ( ( event.result = ret ) === false ) {
										event.preventDefault();
										event.stopPropagation();
									}
								}
							}
						}
					}

					// Call the postDispatch hook for the mapped type
					if ( special.postDispatch ) {
						special.postDispatch.call( this, event );
					}

					return event.result;
				},

				handlers: function( event, handlers ) {
					var i, handleObj, sel, matchedHandlers, matchedSelectors,
						handlerQueue = [],
						delegateCount = handlers.delegateCount,
						cur = event.target;

					// Find delegate handlers
					if ( delegateCount &&

						// Support: IE <=9
						// Black-hole SVG <use> instance trees (trac-13180)
						cur.nodeType &&

						// Support: Firefox <=42
						// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
						// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
						// Support: IE 11 only
						// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
						!( event.type === "click" && event.button >= 1 ) ) {

						for ( ; cur !== this; cur = cur.parentNode || this ) {

							// Don't check non-elements (trac-13208)
							// Don't process clicks on disabled elements (trac-6911, trac-8165, trac-11382, trac-11764)
							if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
								matchedHandlers = [];
								matchedSelectors = {};
								for ( i = 0; i < delegateCount; i++ ) {
									handleObj = handlers[ i ];

									// Don't conflict with Object.prototype properties (trac-13203)
									sel = handleObj.selector + " ";

									if ( matchedSelectors[ sel ] === undefined ) {
										matchedSelectors[ sel ] = handleObj.needsContext ?
											jQuery( sel, this ).index( cur ) > -1 :
											jQuery.find( sel, this, null, [ cur ] ).length;
									}
									if ( matchedSelectors[ sel ] ) {
										matchedHandlers.push( handleObj );
									}
								}
								if ( matchedHandlers.length ) {
									handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
								}
							}
						}
					}

					// Add the remaining (directly-bound) handlers
					cur = this;
					if ( delegateCount < handlers.length ) {
						handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
					}

					return handlerQueue;
				},

				addProp: function( name, hook ) {
					Object.defineProperty( jQuery.Event.prototype, name, {
						enumerable: true,
						configurable: true,

						get: isFunction( hook ) ?
							function() {
								if ( this.originalEvent ) {
									return hook( this.originalEvent );
								}
							} :
							function() {
								if ( this.originalEvent ) {
									return this.originalEvent[ name ];
								}
							},

						set: function( value ) {
							Object.defineProperty( this, name, {
								enumerable: true,
								configurable: true,
								writable: true,
								value: value
							} );
						}
					} );
				},

				fix: function( originalEvent ) {
					return originalEvent[ jQuery.expando ] ?
						originalEvent :
						new jQuery.Event( originalEvent );
				},

				special: {
					load: {

						// Prevent triggered image.load events from bubbling to window.load
						noBubble: true
					},
					click: {

						// Utilize native event to ensure correct state for checkable inputs
						setup: function( data ) {

							// For mutual compressibility with _default, replace `this` access with a local var.
							// `|| data` is dead code meant only to preserve the variable through minification.
							var el = this || data;

							// Claim the first handler
							if ( rcheckableType.test( el.type ) &&
								el.click && nodeName( el, "input" ) ) {

								// dataPriv.set( el, "click", ... )
								leverageNative( el, "click", true );
							}

							// Return false to allow normal processing in the caller
							return false;
						},
						trigger: function( data ) {

							// For mutual compressibility with _default, replace `this` access with a local var.
							// `|| data` is dead code meant only to preserve the variable through minification.
							var el = this || data;

							// Force setup before triggering a click
							if ( rcheckableType.test( el.type ) &&
								el.click && nodeName( el, "input" ) ) {

								leverageNative( el, "click" );
							}

							// Return non-false to allow normal event-path propagation
							return true;
						},

						// For cross-browser consistency, suppress native .click() on links
						// Also prevent it if we're currently inside a leveraged native-event stack
						_default: function( event ) {
							var target = event.target;
							return rcheckableType.test( target.type ) &&
								target.click && nodeName( target, "input" ) &&
								dataPriv.get( target, "click" ) ||
								nodeName( target, "a" );
						}
					},

					beforeunload: {
						postDispatch: function( event ) {

							// Support: Firefox 20+
							// Firefox doesn't alert if the returnValue field is not set.
							if ( event.result !== undefined && event.originalEvent ) {
								event.originalEvent.returnValue = event.result;
							}
						}
					}
				}
			};

			// Ensure the presence of an event listener that handles manually-triggered
			// synthetic events by interrupting progress until reinvoked in response to
			// *native* events that it fires directly, ensuring that state changes have
			// already occurred before other listeners are invoked.
			function leverageNative( el, type, isSetup ) {

				// Missing `isSetup` indicates a trigger call, which must force setup through jQuery.event.add
				if ( !isSetup ) {
					if ( dataPriv.get( el, type ) === undefined ) {
						jQuery.event.add( el, type, returnTrue );
					}
					return;
				}

				// Register the controller as a special universal handler for all event namespaces
				dataPriv.set( el, type, false );
				jQuery.event.add( el, type, {
					namespace: false,
					handler: function( event ) {
						var result,
							saved = dataPriv.get( this, type );

						if ( ( event.isTrigger & 1 ) && this[ type ] ) {

							// Interrupt processing of the outer synthetic .trigger()ed event
							if ( !saved ) {

								// Store arguments for use when handling the inner native event
								// There will always be at least one argument (an event object), so this array
								// will not be confused with a leftover capture object.
								saved = slice.call( arguments );
								dataPriv.set( this, type, saved );

								// Trigger the native event and capture its result
								this[ type ]();
								result = dataPriv.get( this, type );
								dataPriv.set( this, type, false );

								if ( saved !== result ) {

									// Cancel the outer synthetic event
									event.stopImmediatePropagation();
									event.preventDefault();

									return result;
								}

							// If this is an inner synthetic event for an event with a bubbling surrogate
							// (focus or blur), assume that the surrogate already propagated from triggering
							// the native event and prevent that from happening again here.
							// This technically gets the ordering wrong w.r.t. to `.trigger()` (in which the
							// bubbling surrogate propagates *after* the non-bubbling base), but that seems
							// less bad than duplication.
							} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
								event.stopPropagation();
							}

						// If this is a native event triggered above, everything is now in order
						// Fire an inner synthetic event with the original arguments
						} else if ( saved ) {

							// ...and capture the result
							dataPriv.set( this, type, jQuery.event.trigger(
								saved[ 0 ],
								saved.slice( 1 ),
								this
							) );

							// Abort handling of the native event by all jQuery handlers while allowing
							// native handlers on the same element to run. On target, this is achieved
							// by stopping immediate propagation just on the jQuery event. However,
							// the native event is re-wrapped by a jQuery one on each level of the
							// propagation so the only way to stop it for jQuery is to stop it for
							// everyone via native `stopPropagation()`. This is not a problem for
							// focus/blur which don't bubble, but it does also stop click on checkboxes
							// and radios. We accept this limitation.
							event.stopPropagation();
							event.isImmediatePropagationStopped = returnTrue;
						}
					}
				} );
			}

			jQuery.removeEvent = function( elem, type, handle ) {

				// This "if" is needed for plain objects
				if ( elem.removeEventListener ) {
					elem.removeEventListener( type, handle );
				}
			};

			jQuery.Event = function( src, props ) {

				// Allow instantiation without the 'new' keyword
				if ( !( this instanceof jQuery.Event ) ) {
					return new jQuery.Event( src, props );
				}

				// Event object
				if ( src && src.type ) {
					this.originalEvent = src;
					this.type = src.type;

					// Events bubbling up the document may have been marked as prevented
					// by a handler lower down the tree; reflect the correct value.
					this.isDefaultPrevented = src.defaultPrevented ||
							src.defaultPrevented === undefined &&

							// Support: Android <=2.3 only
							src.returnValue === false ?
						returnTrue :
						returnFalse;

					// Create target properties
					// Support: Safari <=6 - 7 only
					// Target should not be a text node (trac-504, trac-13143)
					this.target = ( src.target && src.target.nodeType === 3 ) ?
						src.target.parentNode :
						src.target;

					this.currentTarget = src.currentTarget;
					this.relatedTarget = src.relatedTarget;

				// Event type
				} else {
					this.type = src;
				}

				// Put explicitly provided properties onto the event object
				if ( props ) {
					jQuery.extend( this, props );
				}

				// Create a timestamp if incoming event doesn't have one
				this.timeStamp = src && src.timeStamp || Date.now();

				// Mark it as fixed
				this[ jQuery.expando ] = true;
			};

			// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
			// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
			jQuery.Event.prototype = {
				constructor: jQuery.Event,
				isDefaultPrevented: returnFalse,
				isPropagationStopped: returnFalse,
				isImmediatePropagationStopped: returnFalse,
				isSimulated: false,

				preventDefault: function() {
					var e = this.originalEvent;

					this.isDefaultPrevented = returnTrue;

					if ( e && !this.isSimulated ) {
						e.preventDefault();
					}
				},
				stopPropagation: function() {
					var e = this.originalEvent;

					this.isPropagationStopped = returnTrue;

					if ( e && !this.isSimulated ) {
						e.stopPropagation();
					}
				},
				stopImmediatePropagation: function() {
					var e = this.originalEvent;

					this.isImmediatePropagationStopped = returnTrue;

					if ( e && !this.isSimulated ) {
						e.stopImmediatePropagation();
					}

					this.stopPropagation();
				}
			};

			// Includes all common event props including KeyEvent and MouseEvent specific props
			jQuery.each( {
				altKey: true,
				bubbles: true,
				cancelable: true,
				changedTouches: true,
				ctrlKey: true,
				detail: true,
				eventPhase: true,
				metaKey: true,
				pageX: true,
				pageY: true,
				shiftKey: true,
				view: true,
				"char": true,
				code: true,
				charCode: true,
				key: true,
				keyCode: true,
				button: true,
				buttons: true,
				clientX: true,
				clientY: true,
				offsetX: true,
				offsetY: true,
				pointerId: true,
				pointerType: true,
				screenX: true,
				screenY: true,
				targetTouches: true,
				toElement: true,
				touches: true,
				which: true
			}, jQuery.event.addProp );

			jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {

				function focusMappedHandler( nativeEvent ) {
					if ( document.documentMode ) {

						// Support: IE 11+
						// Attach a single focusin/focusout handler on the document while someone wants
						// focus/blur. This is because the former are synchronous in IE while the latter
						// are async. In other browsers, all those handlers are invoked synchronously.

						// `handle` from private data would already wrap the event, but we need
						// to change the `type` here.
						var handle = dataPriv.get( this, "handle" ),
							event = jQuery.event.fix( nativeEvent );
						event.type = nativeEvent.type === "focusin" ? "focus" : "blur";
						event.isSimulated = true;

						// First, handle focusin/focusout
						handle( nativeEvent );

						// ...then, handle focus/blur
						//
						// focus/blur don't bubble while focusin/focusout do; simulate the former by only
						// invoking the handler at the lower level.
						if ( event.target === event.currentTarget ) {

							// The setup part calls `leverageNative`, which, in turn, calls
							// `jQuery.event.add`, so event handle will already have been set
							// by this point.
							handle( event );
						}
					} else {

						// For non-IE browsers, attach a single capturing handler on the document
						// while someone wants focusin/focusout.
						jQuery.event.simulate( delegateType, nativeEvent.target,
							jQuery.event.fix( nativeEvent ) );
					}
				}

				jQuery.event.special[ type ] = {

					// Utilize native event if possible so blur/focus sequence is correct
					setup: function() {

						var attaches;

						// Claim the first handler
						// dataPriv.set( this, "focus", ... )
						// dataPriv.set( this, "blur", ... )
						leverageNative( this, type, true );

						if ( document.documentMode ) {

							// Support: IE 9 - 11+
							// We use the same native handler for focusin & focus (and focusout & blur)
							// so we need to coordinate setup & teardown parts between those events.
							// Use `delegateType` as the key as `type` is already used by `leverageNative`.
							attaches = dataPriv.get( this, delegateType );
							if ( !attaches ) {
								this.addEventListener( delegateType, focusMappedHandler );
							}
							dataPriv.set( this, delegateType, ( attaches || 0 ) + 1 );
						} else {

							// Return false to allow normal processing in the caller
							return false;
						}
					},
					trigger: function() {

						// Force setup before trigger
						leverageNative( this, type );

						// Return non-false to allow normal event-path propagation
						return true;
					},

					teardown: function() {
						var attaches;

						if ( document.documentMode ) {
							attaches = dataPriv.get( this, delegateType ) - 1;
							if ( !attaches ) {
								this.removeEventListener( delegateType, focusMappedHandler );
								dataPriv.remove( this, delegateType );
							} else {
								dataPriv.set( this, delegateType, attaches );
							}
						} else {

							// Return false to indicate standard teardown should be applied
							return false;
						}
					},

					// Suppress native focus or blur if we're currently inside
					// a leveraged native-event stack
					_default: function( event ) {
						return dataPriv.get( event.target, type );
					},

					delegateType: delegateType
				};

				// Support: Firefox <=44
				// Firefox doesn't have focus(in | out) events
				// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
				//
				// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
				// focus(in | out) events fire after focus & blur events,
				// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
				// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
				//
				// Support: IE 9 - 11+
				// To preserve relative focusin/focus & focusout/blur event order guaranteed on the 3.x branch,
				// attach a single handler for both events in IE.
				jQuery.event.special[ delegateType ] = {
					setup: function() {

						// Handle: regular nodes (via `this.ownerDocument`), window
						// (via `this.document`) & document (via `this`).
						var doc = this.ownerDocument || this.document || this,
							dataHolder = document.documentMode ? this : doc,
							attaches = dataPriv.get( dataHolder, delegateType );

						// Support: IE 9 - 11+
						// We use the same native handler for focusin & focus (and focusout & blur)
						// so we need to coordinate setup & teardown parts between those events.
						// Use `delegateType` as the key as `type` is already used by `leverageNative`.
						if ( !attaches ) {
							if ( document.documentMode ) {
								this.addEventListener( delegateType, focusMappedHandler );
							} else {
								doc.addEventListener( type, focusMappedHandler, true );
							}
						}
						dataPriv.set( dataHolder, delegateType, ( attaches || 0 ) + 1 );
					},
					teardown: function() {
						var doc = this.ownerDocument || this.document || this,
							dataHolder = document.documentMode ? this : doc,
							attaches = dataPriv.get( dataHolder, delegateType ) - 1;

						if ( !attaches ) {
							if ( document.documentMode ) {
								this.removeEventListener( delegateType, focusMappedHandler );
							} else {
								doc.removeEventListener( type, focusMappedHandler, true );
							}
							dataPriv.remove( dataHolder, delegateType );
						} else {
							dataPriv.set( dataHolder, delegateType, attaches );
						}
					}
				};
			} );

			// Create mouseenter/leave events using mouseover/out and event-time checks
			// so that event delegation works in jQuery.
			// Do the same for pointerenter/pointerleave and pointerover/pointerout
			//
			// Support: Safari 7 only
			// Safari sends mouseenter too often; see:
			// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
			// for the description of the bug (it existed in older Chrome versions as well).
			jQuery.each( {
				mouseenter: "mouseover",
				mouseleave: "mouseout",
				pointerenter: "pointerover",
				pointerleave: "pointerout"
			}, function( orig, fix ) {
				jQuery.event.special[ orig ] = {
					delegateType: fix,
					bindType: fix,

					handle: function( event ) {
						var ret,
							target = this,
							related = event.relatedTarget,
							handleObj = event.handleObj;

						// For mouseenter/leave call the handler if related is outside the target.
						// NB: No relatedTarget if the mouse left/entered the browser window
						if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
							event.type = handleObj.origType;
							ret = handleObj.handler.apply( this, arguments );
							event.type = fix;
						}
						return ret;
					}
				};
			} );

			jQuery.fn.extend( {

				on: function( types, selector, data, fn ) {
					return on( this, types, selector, data, fn );
				},
				one: function( types, selector, data, fn ) {
					return on( this, types, selector, data, fn, 1 );
				},
				off: function( types, selector, fn ) {
					var handleObj, type;
					if ( types && types.preventDefault && types.handleObj ) {

						// ( event )  dispatched jQuery.Event
						handleObj = types.handleObj;
						jQuery( types.delegateTarget ).off(
							handleObj.namespace ?
								handleObj.origType + "." + handleObj.namespace :
								handleObj.origType,
							handleObj.selector,
							handleObj.handler
						);
						return this;
					}
					if ( typeof types === "object" ) {

						// ( types-object [, selector] )
						for ( type in types ) {
							this.off( type, selector, types[ type ] );
						}
						return this;
					}
					if ( selector === false || typeof selector === "function" ) {

						// ( types [, fn] )
						fn = selector;
						selector = undefined;
					}
					if ( fn === false ) {
						fn = returnFalse;
					}
					return this.each( function() {
						jQuery.event.remove( this, types, fn, selector );
					} );
				}
			} );


			var

				// Support: IE <=10 - 11, Edge 12 - 13 only
				// In IE/Edge using regex groups here causes severe slowdowns.
				// See https://connect.microsoft.com/IE/feedback/details/1736512/
				rnoInnerhtml = /<script|<style|<link/i,

				// checked="checked" or checked
				rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,

				rcleanScript = /^\s*<!\[CDATA\[|\]\]>\s*$/g;

			// Prefer a tbody over its parent table for containing new rows
			function manipulationTarget( elem, content ) {
				if ( nodeName( elem, "table" ) &&
					nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

					return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
				}

				return elem;
			}

			// Replace/restore the type attribute of script elements for safe DOM manipulation
			function disableScript( elem ) {
				elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
				return elem;
			}
			function restoreScript( elem ) {
				if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
					elem.type = elem.type.slice( 5 );
				} else {
					elem.removeAttribute( "type" );
				}

				return elem;
			}

			function cloneCopyEvent( src, dest ) {
				var i, l, type, pdataOld, udataOld, udataCur, events;

				if ( dest.nodeType !== 1 ) {
					return;
				}

				// 1. Copy private data: events, handlers, etc.
				if ( dataPriv.hasData( src ) ) {
					pdataOld = dataPriv.get( src );
					events = pdataOld.events;

					if ( events ) {
						dataPriv.remove( dest, "handle events" );

						for ( type in events ) {
							for ( i = 0, l = events[ type ].length; i < l; i++ ) {
								jQuery.event.add( dest, type, events[ type ][ i ] );
							}
						}
					}
				}

				// 2. Copy user data
				if ( dataUser.hasData( src ) ) {
					udataOld = dataUser.access( src );
					udataCur = jQuery.extend( {}, udataOld );

					dataUser.set( dest, udataCur );
				}
			}

			// Fix IE bugs, see support tests
			function fixInput( src, dest ) {
				var nodeName = dest.nodeName.toLowerCase();

				// Fails to persist the checked state of a cloned checkbox or radio button.
				if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
					dest.checked = src.checked;

				// Fails to return the selected option to the default selected state when cloning options
				} else if ( nodeName === "input" || nodeName === "textarea" ) {
					dest.defaultValue = src.defaultValue;
				}
			}

			function domManip( collection, args, callback, ignored ) {

				// Flatten any nested arrays
				args = flat( args );

				var fragment, first, scripts, hasScripts, node, doc,
					i = 0,
					l = collection.length,
					iNoClone = l - 1,
					value = args[ 0 ],
					valueIsFunction = isFunction( value );

				// We can't cloneNode fragments that contain checked, in WebKit
				if ( valueIsFunction ||
						( l > 1 && typeof value === "string" &&
							!support.checkClone && rchecked.test( value ) ) ) {
					return collection.each( function( index ) {
						var self = collection.eq( index );
						if ( valueIsFunction ) {
							args[ 0 ] = value.call( this, index, self.html() );
						}
						domManip( self, args, callback, ignored );
					} );
				}

				if ( l ) {
					fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
					first = fragment.firstChild;

					if ( fragment.childNodes.length === 1 ) {
						fragment = first;
					}

					// Require either new content or an interest in ignored elements to invoke the callback
					if ( first || ignored ) {
						scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
						hasScripts = scripts.length;

						// Use the original fragment for the last item
						// instead of the first because it can end up
						// being emptied incorrectly in certain situations (trac-8070).
						for ( ; i < l; i++ ) {
							node = fragment;

							if ( i !== iNoClone ) {
								node = jQuery.clone( node, true, true );

								// Keep references to cloned scripts for later restoration
								if ( hasScripts ) {

									// Support: Android <=4.0 only, PhantomJS 1 only
									// push.apply(_, arraylike) throws on ancient WebKit
									jQuery.merge( scripts, getAll( node, "script" ) );
								}
							}

							callback.call( collection[ i ], node, i );
						}

						if ( hasScripts ) {
							doc = scripts[ scripts.length - 1 ].ownerDocument;

							// Re-enable scripts
							jQuery.map( scripts, restoreScript );

							// Evaluate executable scripts on first document insertion
							for ( i = 0; i < hasScripts; i++ ) {
								node = scripts[ i ];
								if ( rscriptType.test( node.type || "" ) &&
									!dataPriv.access( node, "globalEval" ) &&
									jQuery.contains( doc, node ) ) {

									if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

										// Optional AJAX dependency, but won't run scripts if not present
										if ( jQuery._evalUrl && !node.noModule ) {
											jQuery._evalUrl( node.src, {
												nonce: node.nonce || node.getAttribute( "nonce" )
											}, doc );
										}
									} else {

										// Unwrap a CDATA section containing script contents. This shouldn't be
										// needed as in XML documents they're already not visible when
										// inspecting element contents and in HTML documents they have no
										// meaning but we're preserving that logic for backwards compatibility.
										// This will be removed completely in 4.0. See gh-4904.
										DOMEval( node.textContent.replace( rcleanScript, "" ), node, doc );
									}
								}
							}
						}
					}
				}

				return collection;
			}

			function remove( elem, selector, keepData ) {
				var node,
					nodes = selector ? jQuery.filter( selector, elem ) : elem,
					i = 0;

				for ( ; ( node = nodes[ i ] ) != null; i++ ) {
					if ( !keepData && node.nodeType === 1 ) {
						jQuery.cleanData( getAll( node ) );
					}

					if ( node.parentNode ) {
						if ( keepData && isAttached( node ) ) {
							setGlobalEval( getAll( node, "script" ) );
						}
						node.parentNode.removeChild( node );
					}
				}

				return elem;
			}

			jQuery.extend( {
				htmlPrefilter: function( html ) {
					return html;
				},

				clone: function( elem, dataAndEvents, deepDataAndEvents ) {
					var i, l, srcElements, destElements,
						clone = elem.cloneNode( true ),
						inPage = isAttached( elem );

					// Fix IE cloning issues
					if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
							!jQuery.isXMLDoc( elem ) ) {

						// We eschew jQuery#find here for performance reasons:
						// https://jsperf.com/getall-vs-sizzle/2
						destElements = getAll( clone );
						srcElements = getAll( elem );

						for ( i = 0, l = srcElements.length; i < l; i++ ) {
							fixInput( srcElements[ i ], destElements[ i ] );
						}
					}

					// Copy the events from the original to the clone
					if ( dataAndEvents ) {
						if ( deepDataAndEvents ) {
							srcElements = srcElements || getAll( elem );
							destElements = destElements || getAll( clone );

							for ( i = 0, l = srcElements.length; i < l; i++ ) {
								cloneCopyEvent( srcElements[ i ], destElements[ i ] );
							}
						} else {
							cloneCopyEvent( elem, clone );
						}
					}

					// Preserve script evaluation history
					destElements = getAll( clone, "script" );
					if ( destElements.length > 0 ) {
						setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
					}

					// Return the cloned set
					return clone;
				},

				cleanData: function( elems ) {
					var data, elem, type,
						special = jQuery.event.special,
						i = 0;

					for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
						if ( acceptData( elem ) ) {
							if ( ( data = elem[ dataPriv.expando ] ) ) {
								if ( data.events ) {
									for ( type in data.events ) {
										if ( special[ type ] ) {
											jQuery.event.remove( elem, type );

										// This is a shortcut to avoid jQuery.event.remove's overhead
										} else {
											jQuery.removeEvent( elem, type, data.handle );
										}
									}
								}

								// Support: Chrome <=35 - 45+
								// Assign undefined instead of using delete, see Data#remove
								elem[ dataPriv.expando ] = undefined;
							}
							if ( elem[ dataUser.expando ] ) {

								// Support: Chrome <=35 - 45+
								// Assign undefined instead of using delete, see Data#remove
								elem[ dataUser.expando ] = undefined;
							}
						}
					}
				}
			} );

			jQuery.fn.extend( {
				detach: function( selector ) {
					return remove( this, selector, true );
				},

				remove: function( selector ) {
					return remove( this, selector );
				},

				text: function( value ) {
					return access( this, function( value ) {
						return value === undefined ?
							jQuery.text( this ) :
							this.empty().each( function() {
								if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
									this.textContent = value;
								}
							} );
					}, null, value, arguments.length );
				},

				append: function() {
					return domManip( this, arguments, function( elem ) {
						if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
							var target = manipulationTarget( this, elem );
							target.appendChild( elem );
						}
					} );
				},

				prepend: function() {
					return domManip( this, arguments, function( elem ) {
						if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
							var target = manipulationTarget( this, elem );
							target.insertBefore( elem, target.firstChild );
						}
					} );
				},

				before: function() {
					return domManip( this, arguments, function( elem ) {
						if ( this.parentNode ) {
							this.parentNode.insertBefore( elem, this );
						}
					} );
				},

				after: function() {
					return domManip( this, arguments, function( elem ) {
						if ( this.parentNode ) {
							this.parentNode.insertBefore( elem, this.nextSibling );
						}
					} );
				},

				empty: function() {
					var elem,
						i = 0;

					for ( ; ( elem = this[ i ] ) != null; i++ ) {
						if ( elem.nodeType === 1 ) {

							// Prevent memory leaks
							jQuery.cleanData( getAll( elem, false ) );

							// Remove any remaining nodes
							elem.textContent = "";
						}
					}

					return this;
				},

				clone: function( dataAndEvents, deepDataAndEvents ) {
					dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
					deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

					return this.map( function() {
						return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
					} );
				},

				html: function( value ) {
					return access( this, function( value ) {
						var elem = this[ 0 ] || {},
							i = 0,
							l = this.length;

						if ( value === undefined && elem.nodeType === 1 ) {
							return elem.innerHTML;
						}

						// See if we can take a shortcut and just use innerHTML
						if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
							!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

							value = jQuery.htmlPrefilter( value );

							try {
								for ( ; i < l; i++ ) {
									elem = this[ i ] || {};

									// Remove element nodes and prevent memory leaks
									if ( elem.nodeType === 1 ) {
										jQuery.cleanData( getAll( elem, false ) );
										elem.innerHTML = value;
									}
								}

								elem = 0;

							// If using innerHTML throws an exception, use the fallback method
							} catch ( e ) {}
						}

						if ( elem ) {
							this.empty().append( value );
						}
					}, null, value, arguments.length );
				},

				replaceWith: function() {
					var ignored = [];

					// Make the changes, replacing each non-ignored context element with the new content
					return domManip( this, arguments, function( elem ) {
						var parent = this.parentNode;

						if ( jQuery.inArray( this, ignored ) < 0 ) {
							jQuery.cleanData( getAll( this ) );
							if ( parent ) {
								parent.replaceChild( elem, this );
							}
						}

					// Force callback invocation
					}, ignored );
				}
			} );

			jQuery.each( {
				appendTo: "append",
				prependTo: "prepend",
				insertBefore: "before",
				insertAfter: "after",
				replaceAll: "replaceWith"
			}, function( name, original ) {
				jQuery.fn[ name ] = function( selector ) {
					var elems,
						ret = [],
						insert = jQuery( selector ),
						last = insert.length - 1,
						i = 0;

					for ( ; i <= last; i++ ) {
						elems = i === last ? this : this.clone( true );
						jQuery( insert[ i ] )[ original ]( elems );

						// Support: Android <=4.0 only, PhantomJS 1 only
						// .get() because push.apply(_, arraylike) throws on ancient WebKit
						push.apply( ret, elems.get() );
					}

					return this.pushStack( ret );
				};
			} );
			var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

			var rcustomProp = /^--/;


			var getStyles = function( elem ) {

					// Support: IE <=11 only, Firefox <=30 (trac-15098, trac-14150)
					// IE throws on elements created in popups
					// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
					var view = elem.ownerDocument.defaultView;

					if ( !view || !view.opener ) {
						view = window;
					}

					return view.getComputedStyle( elem );
				};

			var swap = function( elem, options, callback ) {
				var ret, name,
					old = {};

				// Remember the old values, and insert the new ones
				for ( name in options ) {
					old[ name ] = elem.style[ name ];
					elem.style[ name ] = options[ name ];
				}

				ret = callback.call( elem );

				// Revert the old values
				for ( name in options ) {
					elem.style[ name ] = old[ name ];
				}

				return ret;
			};


			var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



			( function() {

				// Executing both pixelPosition & boxSizingReliable tests require only one layout
				// so they're executed at the same time to save the second computation.
				function computeStyleTests() {

					// This is a singleton, we need to execute it only once
					if ( !div ) {
						return;
					}

					container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
						"margin-top:1px;padding:0;border:0";
					div.style.cssText =
						"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
						"margin:auto;border:1px;padding:1px;" +
						"width:60%;top:1%";
					documentElement.appendChild( container ).appendChild( div );

					var divStyle = window.getComputedStyle( div );
					pixelPositionVal = divStyle.top !== "1%";

					// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
					reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

					// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
					// Some styles come back with percentage values, even though they shouldn't
					div.style.right = "60%";
					pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

					// Support: IE 9 - 11 only
					// Detect misreporting of content dimensions for box-sizing:border-box elements
					boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

					// Support: IE 9 only
					// Detect overflow:scroll screwiness (gh-3699)
					// Support: Chrome <=64
					// Don't get tricked when zoom affects offsetWidth (gh-4029)
					div.style.position = "absolute";
					scrollboxSizeVal = roundPixelMeasures( div.offsetWidth / 3 ) === 12;

					documentElement.removeChild( container );

					// Nullify the div so it wouldn't be stored in the memory and
					// it will also be a sign that checks already performed
					div = null;
				}

				function roundPixelMeasures( measure ) {
					return Math.round( parseFloat( measure ) );
				}

				var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
					reliableTrDimensionsVal, reliableMarginLeftVal,
					container = document.createElement( "div" ),
					div = document.createElement( "div" );

				// Finish early in limited (non-browser) environments
				if ( !div.style ) {
					return;
				}

				// Support: IE <=9 - 11 only
				// Style of cloned element affects source element cloned (trac-8908)
				div.style.backgroundClip = "content-box";
				div.cloneNode( true ).style.backgroundClip = "";
				support.clearCloneStyle = div.style.backgroundClip === "content-box";

				jQuery.extend( support, {
					boxSizingReliable: function() {
						computeStyleTests();
						return boxSizingReliableVal;
					},
					pixelBoxStyles: function() {
						computeStyleTests();
						return pixelBoxStylesVal;
					},
					pixelPosition: function() {
						computeStyleTests();
						return pixelPositionVal;
					},
					reliableMarginLeft: function() {
						computeStyleTests();
						return reliableMarginLeftVal;
					},
					scrollboxSize: function() {
						computeStyleTests();
						return scrollboxSizeVal;
					},

					// Support: IE 9 - 11+, Edge 15 - 18+
					// IE/Edge misreport `getComputedStyle` of table rows with width/height
					// set in CSS while `offset*` properties report correct values.
					// Behavior in IE 9 is more subtle than in newer versions & it passes
					// some versions of this test; make sure not to make it pass there!
					//
					// Support: Firefox 70+
					// Only Firefox includes border widths
					// in computed dimensions. (gh-4529)
					reliableTrDimensions: function() {
						var table, tr, trChild, trStyle;
						if ( reliableTrDimensionsVal == null ) {
							table = document.createElement( "table" );
							tr = document.createElement( "tr" );
							trChild = document.createElement( "div" );

							table.style.cssText = "position:absolute;left:-11111px;border-collapse:separate";
							tr.style.cssText = "box-sizing:content-box;border:1px solid";

							// Support: Chrome 86+
							// Height set through cssText does not get applied.
							// Computed height then comes back as 0.
							tr.style.height = "1px";
							trChild.style.height = "9px";

							// Support: Android 8 Chrome 86+
							// In our bodyBackground.html iframe,
							// display for all div elements is set to "inline",
							// which causes a problem only in Android 8 Chrome 86.
							// Ensuring the div is `display: block`
							// gets around this issue.
							trChild.style.display = "block";

							documentElement
								.appendChild( table )
								.appendChild( tr )
								.appendChild( trChild );

							trStyle = window.getComputedStyle( tr );
							reliableTrDimensionsVal = ( parseInt( trStyle.height, 10 ) +
								parseInt( trStyle.borderTopWidth, 10 ) +
								parseInt( trStyle.borderBottomWidth, 10 ) ) === tr.offsetHeight;

							documentElement.removeChild( table );
						}
						return reliableTrDimensionsVal;
					}
				} );
			} )();


			function curCSS( elem, name, computed ) {
				var width, minWidth, maxWidth, ret,
					isCustomProp = rcustomProp.test( name ),

					// Support: Firefox 51+
					// Retrieving style before computed somehow
					// fixes an issue with getting wrong values
					// on detached elements
					style = elem.style;

				computed = computed || getStyles( elem );

				// getPropertyValue is needed for:
				//   .css('filter') (IE 9 only, trac-12537)
				//   .css('--customProperty) (gh-3144)
				if ( computed ) {

					// Support: IE <=9 - 11+
					// IE only supports `"float"` in `getPropertyValue`; in computed styles
					// it's only available as `"cssFloat"`. We no longer modify properties
					// sent to `.css()` apart from camelCasing, so we need to check both.
					// Normally, this would create difference in behavior: if
					// `getPropertyValue` returns an empty string, the value returned
					// by `.css()` would be `undefined`. This is usually the case for
					// disconnected elements. However, in IE even disconnected elements
					// with no styles return `"none"` for `getPropertyValue( "float" )`
					ret = computed.getPropertyValue( name ) || computed[ name ];

					if ( isCustomProp && ret ) {

						// Support: Firefox 105+, Chrome <=105+
						// Spec requires trimming whitespace for custom properties (gh-4926).
						// Firefox only trims leading whitespace. Chrome just collapses
						// both leading & trailing whitespace to a single space.
						//
						// Fall back to `undefined` if empty string returned.
						// This collapses a missing definition with property defined
						// and set to an empty string but there's no standard API
						// allowing us to differentiate them without a performance penalty
						// and returning `undefined` aligns with older jQuery.
						//
						// rtrimCSS treats U+000D CARRIAGE RETURN and U+000C FORM FEED
						// as whitespace while CSS does not, but this is not a problem
						// because CSS preprocessing replaces them with U+000A LINE FEED
						// (which *is* CSS whitespace)
						// https://www.w3.org/TR/css-syntax-3/#input-preprocessing
						ret = ret.replace( rtrimCSS, "$1" ) || undefined;
					}

					if ( ret === "" && !isAttached( elem ) ) {
						ret = jQuery.style( elem, name );
					}

					// A tribute to the "awesome hack by Dean Edwards"
					// Android Browser returns percentage for some values,
					// but width seems to be reliably pixels.
					// This is against the CSSOM draft spec:
					// https://drafts.csswg.org/cssom/#resolved-values
					if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

						// Remember the original values
						width = style.width;
						minWidth = style.minWidth;
						maxWidth = style.maxWidth;

						// Put in the new values to get a computed value out
						style.minWidth = style.maxWidth = style.width = ret;
						ret = computed.width;

						// Revert the changed values
						style.width = width;
						style.minWidth = minWidth;
						style.maxWidth = maxWidth;
					}
				}

				return ret !== undefined ?

					// Support: IE <=9 - 11 only
					// IE returns zIndex value as an integer.
					ret + "" :
					ret;
			}


			function addGetHookIf( conditionFn, hookFn ) {

				// Define the hook, we'll check on the first run if it's really needed.
				return {
					get: function() {
						if ( conditionFn() ) {

							// Hook not needed (or it's not possible to use it due
							// to missing dependency), remove it.
							delete this.get;
							return;
						}

						// Hook needed; redefine it so that the support test is not executed again.
						return ( this.get = hookFn ).apply( this, arguments );
					}
				};
			}


			var cssPrefixes = [ "Webkit", "Moz", "ms" ],
				emptyStyle = document.createElement( "div" ).style,
				vendorProps = {};

			// Return a vendor-prefixed property or undefined
			function vendorPropName( name ) {

				// Check for vendor prefixed names
				var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
					i = cssPrefixes.length;

				while ( i-- ) {
					name = cssPrefixes[ i ] + capName;
					if ( name in emptyStyle ) {
						return name;
					}
				}
			}

			// Return a potentially-mapped jQuery.cssProps or vendor prefixed property
			function finalPropName( name ) {
				var final = jQuery.cssProps[ name ] || vendorProps[ name ];

				if ( final ) {
					return final;
				}
				if ( name in emptyStyle ) {
					return name;
				}
				return vendorProps[ name ] = vendorPropName( name ) || name;
			}


			var

				// Swappable if display is none or starts with table
				// except "table", "table-cell", or "table-caption"
				// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
				rdisplayswap = /^(none|table(?!-c[ea]).+)/,
				cssShow = { position: "absolute", visibility: "hidden", display: "block" },
				cssNormalTransform = {
					letterSpacing: "0",
					fontWeight: "400"
				};

			function setPositiveNumber( _elem, value, subtract ) {

				// Any relative (+/-) values have already been
				// normalized at this point
				var matches = rcssNum.exec( value );
				return matches ?

					// Guard against undefined "subtract", e.g., when used as in cssHooks
					Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
					value;
			}

			function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
				var i = dimension === "width" ? 1 : 0,
					extra = 0,
					delta = 0,
					marginDelta = 0;

				// Adjustment may not be necessary
				if ( box === ( isBorderBox ? "border" : "content" ) ) {
					return 0;
				}

				for ( ; i < 4; i += 2 ) {

					// Both box models exclude margin
					// Count margin delta separately to only add it after scroll gutter adjustment.
					// This is needed to make negative margins work with `outerHeight( true )` (gh-3982).
					if ( box === "margin" ) {
						marginDelta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
					}

					// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
					if ( !isBorderBox ) {

						// Add padding
						delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

						// For "border" or "margin", add border
						if ( box !== "padding" ) {
							delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

						// But still keep track of it otherwise
						} else {
							extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
						}

					// If we get here with a border-box (content + padding + border), we're seeking "content" or
					// "padding" or "margin"
					} else {

						// For "content", subtract padding
						if ( box === "content" ) {
							delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
						}

						// For "content" or "padding", subtract border
						if ( box !== "margin" ) {
							delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
						}
					}
				}

				// Account for positive content-box scroll gutter when requested by providing computedVal
				if ( !isBorderBox && computedVal >= 0 ) {

					// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
					// Assuming integer scroll gutter, subtract the rest and round down
					delta += Math.max( 0, Math.ceil(
						elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
						computedVal -
						delta -
						extra -
						0.5

					// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
					// Use an explicit zero to avoid NaN (gh-3964)
					) ) || 0;
				}

				return delta + marginDelta;
			}

			function getWidthOrHeight( elem, dimension, extra ) {

				// Start with computed style
				var styles = getStyles( elem ),

					// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
					// Fake content-box until we know it's needed to know the true value.
					boxSizingNeeded = !support.boxSizingReliable() || extra,
					isBorderBox = boxSizingNeeded &&
						jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					valueIsBorderBox = isBorderBox,

					val = curCSS( elem, dimension, styles ),
					offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

				// Support: Firefox <=54
				// Return a confounding non-pixel value or feign ignorance, as appropriate.
				if ( rnumnonpx.test( val ) ) {
					if ( !extra ) {
						return val;
					}
					val = "auto";
				}


				// Support: IE 9 - 11 only
				// Use offsetWidth/offsetHeight for when box sizing is unreliable.
				// In those cases, the computed value can be trusted to be border-box.
				if ( ( !support.boxSizingReliable() && isBorderBox ||

					// Support: IE 10 - 11+, Edge 15 - 18+
					// IE/Edge misreport `getComputedStyle` of table rows with width/height
					// set in CSS while `offset*` properties report correct values.
					// Interestingly, in some cases IE 9 doesn't suffer from this issue.
					!support.reliableTrDimensions() && nodeName( elem, "tr" ) ||

					// Fall back to offsetWidth/offsetHeight when value is "auto"
					// This happens for inline elements with no explicit setting (gh-3571)
					val === "auto" ||

					// Support: Android <=4.1 - 4.3 only
					// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
					!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) &&

					// Make sure the element is visible & connected
					elem.getClientRects().length ) {

					isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

					// Where available, offsetWidth/offsetHeight approximate border box dimensions.
					// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
					// retrieved value as a content box dimension.
					valueIsBorderBox = offsetProp in elem;
					if ( valueIsBorderBox ) {
						val = elem[ offsetProp ];
					}
				}

				// Normalize "" and auto
				val = parseFloat( val ) || 0;

				// Adjust for the element's box model
				return ( val +
					boxModelAdjustment(
						elem,
						dimension,
						extra || ( isBorderBox ? "border" : "content" ),
						valueIsBorderBox,
						styles,

						// Provide the current computed size to request scroll gutter calculation (gh-3589)
						val
					)
				) + "px";
			}

			jQuery.extend( {

				// Add in style property hooks for overriding the default
				// behavior of getting and setting a style property
				cssHooks: {
					opacity: {
						get: function( elem, computed ) {
							if ( computed ) {

								// We should always get a number back from opacity
								var ret = curCSS( elem, "opacity" );
								return ret === "" ? "1" : ret;
							}
						}
					}
				},

				// Don't automatically add "px" to these possibly-unitless properties
				cssNumber: {
					animationIterationCount: true,
					aspectRatio: true,
					borderImageSlice: true,
					columnCount: true,
					flexGrow: true,
					flexShrink: true,
					fontWeight: true,
					gridArea: true,
					gridColumn: true,
					gridColumnEnd: true,
					gridColumnStart: true,
					gridRow: true,
					gridRowEnd: true,
					gridRowStart: true,
					lineHeight: true,
					opacity: true,
					order: true,
					orphans: true,
					scale: true,
					widows: true,
					zIndex: true,
					zoom: true,

					// SVG-related
					fillOpacity: true,
					floodOpacity: true,
					stopOpacity: true,
					strokeMiterlimit: true,
					strokeOpacity: true
				},

				// Add in properties whose names you wish to fix before
				// setting or getting the value
				cssProps: {},

				// Get and set the style property on a DOM Node
				style: function( elem, name, value, extra ) {

					// Don't set styles on text and comment nodes
					if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
						return;
					}

					// Make sure that we're working with the right name
					var ret, type, hooks,
						origName = camelCase( name ),
						isCustomProp = rcustomProp.test( name ),
						style = elem.style;

					// Make sure that we're working with the right name. We don't
					// want to query the value if it is a CSS custom property
					// since they are user-defined.
					if ( !isCustomProp ) {
						name = finalPropName( origName );
					}

					// Gets hook for the prefixed version, then unprefixed version
					hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

					// Check if we're setting a value
					if ( value !== undefined ) {
						type = typeof value;

						// Convert "+=" or "-=" to relative numbers (trac-7345)
						if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
							value = adjustCSS( elem, name, ret );

							// Fixes bug trac-9237
							type = "number";
						}

						// Make sure that null and NaN values aren't set (trac-7116)
						if ( value == null || value !== value ) {
							return;
						}

						// If a number was passed in, add the unit (except for certain CSS properties)
						// The isCustomProp check can be removed in jQuery 4.0 when we only auto-append
						// "px" to a few hardcoded values.
						if ( type === "number" && !isCustomProp ) {
							value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
						}

						// background-* props affect original clone's values
						if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
							style[ name ] = "inherit";
						}

						// If a hook was provided, use that value, otherwise just set the specified value
						if ( !hooks || !( "set" in hooks ) ||
							( value = hooks.set( elem, value, extra ) ) !== undefined ) {

							if ( isCustomProp ) {
								style.setProperty( name, value );
							} else {
								style[ name ] = value;
							}
						}

					} else {

						// If a hook was provided get the non-computed value from there
						if ( hooks && "get" in hooks &&
							( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

							return ret;
						}

						// Otherwise just get the value from the style object
						return style[ name ];
					}
				},

				css: function( elem, name, extra, styles ) {
					var val, num, hooks,
						origName = camelCase( name ),
						isCustomProp = rcustomProp.test( name );

					// Make sure that we're working with the right name. We don't
					// want to modify the value if it is a CSS custom property
					// since they are user-defined.
					if ( !isCustomProp ) {
						name = finalPropName( origName );
					}

					// Try prefixed name followed by the unprefixed name
					hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

					// If a hook was provided get the computed value from there
					if ( hooks && "get" in hooks ) {
						val = hooks.get( elem, true, extra );
					}

					// Otherwise, if a way to get the computed value exists, use that
					if ( val === undefined ) {
						val = curCSS( elem, name, styles );
					}

					// Convert "normal" to computed value
					if ( val === "normal" && name in cssNormalTransform ) {
						val = cssNormalTransform[ name ];
					}

					// Make numeric if forced or a qualifier was provided and val looks numeric
					if ( extra === "" || extra ) {
						num = parseFloat( val );
						return extra === true || isFinite( num ) ? num || 0 : val;
					}

					return val;
				}
			} );

			jQuery.each( [ "height", "width" ], function( _i, dimension ) {
				jQuery.cssHooks[ dimension ] = {
					get: function( elem, computed, extra ) {
						if ( computed ) {

							// Certain elements can have dimension info if we invisibly show them
							// but it must have a current display style that would benefit
							return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

								// Support: Safari 8+
								// Table columns in Safari have non-zero offsetWidth & zero
								// getBoundingClientRect().width unless display is changed.
								// Support: IE <=11 only
								// Running getBoundingClientRect on a disconnected node
								// in IE throws an error.
								( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
								swap( elem, cssShow, function() {
									return getWidthOrHeight( elem, dimension, extra );
								} ) :
								getWidthOrHeight( elem, dimension, extra );
						}
					},

					set: function( elem, value, extra ) {
						var matches,
							styles = getStyles( elem ),

							// Only read styles.position if the test has a chance to fail
							// to avoid forcing a reflow.
							scrollboxSizeBuggy = !support.scrollboxSize() &&
								styles.position === "absolute",

							// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
							boxSizingNeeded = scrollboxSizeBuggy || extra,
							isBorderBox = boxSizingNeeded &&
								jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
							subtract = extra ?
								boxModelAdjustment(
									elem,
									dimension,
									extra,
									isBorderBox,
									styles
								) :
								0;

						// Account for unreliable border-box dimensions by comparing offset* to computed and
						// faking a content-box to get border and padding (gh-3699)
						if ( isBorderBox && scrollboxSizeBuggy ) {
							subtract -= Math.ceil(
								elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
								parseFloat( styles[ dimension ] ) -
								boxModelAdjustment( elem, dimension, "border", false, styles ) -
								0.5
							);
						}

						// Convert to pixels if value adjustment is needed
						if ( subtract && ( matches = rcssNum.exec( value ) ) &&
							( matches[ 3 ] || "px" ) !== "px" ) {

							elem.style[ dimension ] = value;
							value = jQuery.css( elem, dimension );
						}

						return setPositiveNumber( elem, value, subtract );
					}
				};
			} );

			jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
				function( elem, computed ) {
					if ( computed ) {
						return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
							elem.getBoundingClientRect().left -
								swap( elem, { marginLeft: 0 }, function() {
									return elem.getBoundingClientRect().left;
								} )
						) + "px";
					}
				}
			);

			// These hooks are used by animate to expand properties
			jQuery.each( {
				margin: "",
				padding: "",
				border: "Width"
			}, function( prefix, suffix ) {
				jQuery.cssHooks[ prefix + suffix ] = {
					expand: function( value ) {
						var i = 0,
							expanded = {},

							// Assumes a single number if not a string
							parts = typeof value === "string" ? value.split( " " ) : [ value ];

						for ( ; i < 4; i++ ) {
							expanded[ prefix + cssExpand[ i ] + suffix ] =
								parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
						}

						return expanded;
					}
				};

				if ( prefix !== "margin" ) {
					jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
				}
			} );

			jQuery.fn.extend( {
				css: function( name, value ) {
					return access( this, function( elem, name, value ) {
						var styles, len,
							map = {},
							i = 0;

						if ( Array.isArray( name ) ) {
							styles = getStyles( elem );
							len = name.length;

							for ( ; i < len; i++ ) {
								map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
							}

							return map;
						}

						return value !== undefined ?
							jQuery.style( elem, name, value ) :
							jQuery.css( elem, name );
					}, name, value, arguments.length > 1 );
				}
			} );


			function Tween( elem, options, prop, end, easing ) {
				return new Tween.prototype.init( elem, options, prop, end, easing );
			}
			jQuery.Tween = Tween;

			Tween.prototype = {
				constructor: Tween,
				init: function( elem, options, prop, end, easing, unit ) {
					this.elem = elem;
					this.prop = prop;
					this.easing = easing || jQuery.easing._default;
					this.options = options;
					this.start = this.now = this.cur();
					this.end = end;
					this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
				},
				cur: function() {
					var hooks = Tween.propHooks[ this.prop ];

					return hooks && hooks.get ?
						hooks.get( this ) :
						Tween.propHooks._default.get( this );
				},
				run: function( percent ) {
					var eased,
						hooks = Tween.propHooks[ this.prop ];

					if ( this.options.duration ) {
						this.pos = eased = jQuery.easing[ this.easing ](
							percent, this.options.duration * percent, 0, 1, this.options.duration
						);
					} else {
						this.pos = eased = percent;
					}
					this.now = ( this.end - this.start ) * eased + this.start;

					if ( this.options.step ) {
						this.options.step.call( this.elem, this.now, this );
					}

					if ( hooks && hooks.set ) {
						hooks.set( this );
					} else {
						Tween.propHooks._default.set( this );
					}
					return this;
				}
			};

			Tween.prototype.init.prototype = Tween.prototype;

			Tween.propHooks = {
				_default: {
					get: function( tween ) {
						var result;

						// Use a property on the element directly when it is not a DOM element,
						// or when there is no matching style property that exists.
						if ( tween.elem.nodeType !== 1 ||
							tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
							return tween.elem[ tween.prop ];
						}

						// Passing an empty string as a 3rd parameter to .css will automatically
						// attempt a parseFloat and fallback to a string if the parse fails.
						// Simple values such as "10px" are parsed to Float;
						// complex values such as "rotate(1rad)" are returned as-is.
						result = jQuery.css( tween.elem, tween.prop, "" );

						// Empty strings, null, undefined and "auto" are converted to 0.
						return !result || result === "auto" ? 0 : result;
					},
					set: function( tween ) {

						// Use step hook for back compat.
						// Use cssHook if its there.
						// Use .style if available and use plain properties where available.
						if ( jQuery.fx.step[ tween.prop ] ) {
							jQuery.fx.step[ tween.prop ]( tween );
						} else if ( tween.elem.nodeType === 1 && (
							jQuery.cssHooks[ tween.prop ] ||
								tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
							jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
						} else {
							tween.elem[ tween.prop ] = tween.now;
						}
					}
				}
			};

			// Support: IE <=9 only
			// Panic based approach to setting things on disconnected nodes
			Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
				set: function( tween ) {
					if ( tween.elem.nodeType && tween.elem.parentNode ) {
						tween.elem[ tween.prop ] = tween.now;
					}
				}
			};

			jQuery.easing = {
				linear: function( p ) {
					return p;
				},
				swing: function( p ) {
					return 0.5 - Math.cos( p * Math.PI ) / 2;
				},
				_default: "swing"
			};

			jQuery.fx = Tween.prototype.init;

			// Back compat <1.8 extension point
			jQuery.fx.step = {};




			var
				fxNow, inProgress,
				rfxtypes = /^(?:toggle|show|hide)$/,
				rrun = /queueHooks$/;

			function schedule() {
				if ( inProgress ) {
					if ( document.hidden === false && window.requestAnimationFrame ) {
						window.requestAnimationFrame( schedule );
					} else {
						window.setTimeout( schedule, jQuery.fx.interval );
					}

					jQuery.fx.tick();
				}
			}

			// Animations created synchronously will run synchronously
			function createFxNow() {
				window.setTimeout( function() {
					fxNow = undefined;
				} );
				return ( fxNow = Date.now() );
			}

			// Generate parameters to create a standard animation
			function genFx( type, includeWidth ) {
				var which,
					i = 0,
					attrs = { height: type };

				// If we include width, step value is 1 to do all cssExpand values,
				// otherwise step value is 2 to skip over Left and Right
				includeWidth = includeWidth ? 1 : 0;
				for ( ; i < 4; i += 2 - includeWidth ) {
					which = cssExpand[ i ];
					attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
				}

				if ( includeWidth ) {
					attrs.opacity = attrs.width = type;
				}

				return attrs;
			}

			function createTween( value, prop, animation ) {
				var tween,
					collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
					index = 0,
					length = collection.length;
				for ( ; index < length; index++ ) {
					if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

						// We're done with this property
						return tween;
					}
				}
			}

			function defaultPrefilter( elem, props, opts ) {
				var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
					isBox = "width" in props || "height" in props,
					anim = this,
					orig = {},
					style = elem.style,
					hidden = elem.nodeType && isHiddenWithinTree( elem ),
					dataShow = dataPriv.get( elem, "fxshow" );

				// Queue-skipping animations hijack the fx hooks
				if ( !opts.queue ) {
					hooks = jQuery._queueHooks( elem, "fx" );
					if ( hooks.unqueued == null ) {
						hooks.unqueued = 0;
						oldfire = hooks.empty.fire;
						hooks.empty.fire = function() {
							if ( !hooks.unqueued ) {
								oldfire();
							}
						};
					}
					hooks.unqueued++;

					anim.always( function() {

						// Ensure the complete handler is called before this completes
						anim.always( function() {
							hooks.unqueued--;
							if ( !jQuery.queue( elem, "fx" ).length ) {
								hooks.empty.fire();
							}
						} );
					} );
				}

				// Detect show/hide animations
				for ( prop in props ) {
					value = props[ prop ];
					if ( rfxtypes.test( value ) ) {
						delete props[ prop ];
						toggle = toggle || value === "toggle";
						if ( value === ( hidden ? "hide" : "show" ) ) {

							// Pretend to be hidden if this is a "show" and
							// there is still data from a stopped show/hide
							if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
								hidden = true;

							// Ignore all other no-op show/hide data
							} else {
								continue;
							}
						}
						orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
					}
				}

				// Bail out if this is a no-op like .hide().hide()
				propTween = !jQuery.isEmptyObject( props );
				if ( !propTween && jQuery.isEmptyObject( orig ) ) {
					return;
				}

				// Restrict "overflow" and "display" styles during box animations
				if ( isBox && elem.nodeType === 1 ) {

					// Support: IE <=9 - 11, Edge 12 - 15
					// Record all 3 overflow attributes because IE does not infer the shorthand
					// from identically-valued overflowX and overflowY and Edge just mirrors
					// the overflowX value there.
					opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

					// Identify a display type, preferring old show/hide data over the CSS cascade
					restoreDisplay = dataShow && dataShow.display;
					if ( restoreDisplay == null ) {
						restoreDisplay = dataPriv.get( elem, "display" );
					}
					display = jQuery.css( elem, "display" );
					if ( display === "none" ) {
						if ( restoreDisplay ) {
							display = restoreDisplay;
						} else {

							// Get nonempty value(s) by temporarily forcing visibility
							showHide( [ elem ], true );
							restoreDisplay = elem.style.display || restoreDisplay;
							display = jQuery.css( elem, "display" );
							showHide( [ elem ] );
						}
					}

					// Animate inline elements as inline-block
					if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
						if ( jQuery.css( elem, "float" ) === "none" ) {

							// Restore the original display value at the end of pure show/hide animations
							if ( !propTween ) {
								anim.done( function() {
									style.display = restoreDisplay;
								} );
								if ( restoreDisplay == null ) {
									display = style.display;
									restoreDisplay = display === "none" ? "" : display;
								}
							}
							style.display = "inline-block";
						}
					}
				}

				if ( opts.overflow ) {
					style.overflow = "hidden";
					anim.always( function() {
						style.overflow = opts.overflow[ 0 ];
						style.overflowX = opts.overflow[ 1 ];
						style.overflowY = opts.overflow[ 2 ];
					} );
				}

				// Implement show/hide animations
				propTween = false;
				for ( prop in orig ) {

					// General show/hide setup for this element animation
					if ( !propTween ) {
						if ( dataShow ) {
							if ( "hidden" in dataShow ) {
								hidden = dataShow.hidden;
							}
						} else {
							dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
						}

						// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
						if ( toggle ) {
							dataShow.hidden = !hidden;
						}

						// Show elements before animating them
						if ( hidden ) {
							showHide( [ elem ], true );
						}

						/* eslint-disable no-loop-func */

						anim.done( function() {

							/* eslint-enable no-loop-func */

							// The final step of a "hide" animation is actually hiding the element
							if ( !hidden ) {
								showHide( [ elem ] );
							}
							dataPriv.remove( elem, "fxshow" );
							for ( prop in orig ) {
								jQuery.style( elem, prop, orig[ prop ] );
							}
						} );
					}

					// Per-property setup
					propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
					if ( !( prop in dataShow ) ) {
						dataShow[ prop ] = propTween.start;
						if ( hidden ) {
							propTween.end = propTween.start;
							propTween.start = 0;
						}
					}
				}
			}

			function propFilter( props, specialEasing ) {
				var index, name, easing, value, hooks;

				// camelCase, specialEasing and expand cssHook pass
				for ( index in props ) {
					name = camelCase( index );
					easing = specialEasing[ name ];
					value = props[ index ];
					if ( Array.isArray( value ) ) {
						easing = value[ 1 ];
						value = props[ index ] = value[ 0 ];
					}

					if ( index !== name ) {
						props[ name ] = value;
						delete props[ index ];
					}

					hooks = jQuery.cssHooks[ name ];
					if ( hooks && "expand" in hooks ) {
						value = hooks.expand( value );
						delete props[ name ];

						// Not quite $.extend, this won't overwrite existing keys.
						// Reusing 'index' because we have the correct "name"
						for ( index in value ) {
							if ( !( index in props ) ) {
								props[ index ] = value[ index ];
								specialEasing[ index ] = easing;
							}
						}
					} else {
						specialEasing[ name ] = easing;
					}
				}
			}

			function Animation( elem, properties, options ) {
				var result,
					stopped,
					index = 0,
					length = Animation.prefilters.length,
					deferred = jQuery.Deferred().always( function() {

						// Don't match elem in the :animated selector
						delete tick.elem;
					} ),
					tick = function() {
						if ( stopped ) {
							return false;
						}
						var currentTime = fxNow || createFxNow(),
							remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

							// Support: Android 2.3 only
							// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (trac-12497)
							temp = remaining / animation.duration || 0,
							percent = 1 - temp,
							index = 0,
							length = animation.tweens.length;

						for ( ; index < length; index++ ) {
							animation.tweens[ index ].run( percent );
						}

						deferred.notifyWith( elem, [ animation, percent, remaining ] );

						// If there's more to do, yield
						if ( percent < 1 && length ) {
							return remaining;
						}

						// If this was an empty animation, synthesize a final progress notification
						if ( !length ) {
							deferred.notifyWith( elem, [ animation, 1, 0 ] );
						}

						// Resolve the animation and report its conclusion
						deferred.resolveWith( elem, [ animation ] );
						return false;
					},
					animation = deferred.promise( {
						elem: elem,
						props: jQuery.extend( {}, properties ),
						opts: jQuery.extend( true, {
							specialEasing: {},
							easing: jQuery.easing._default
						}, options ),
						originalProperties: properties,
						originalOptions: options,
						startTime: fxNow || createFxNow(),
						duration: options.duration,
						tweens: [],
						createTween: function( prop, end ) {
							var tween = jQuery.Tween( elem, animation.opts, prop, end,
								animation.opts.specialEasing[ prop ] || animation.opts.easing );
							animation.tweens.push( tween );
							return tween;
						},
						stop: function( gotoEnd ) {
							var index = 0,

								// If we are going to the end, we want to run all the tweens
								// otherwise we skip this part
								length = gotoEnd ? animation.tweens.length : 0;
							if ( stopped ) {
								return this;
							}
							stopped = true;
							for ( ; index < length; index++ ) {
								animation.tweens[ index ].run( 1 );
							}

							// Resolve when we played the last frame; otherwise, reject
							if ( gotoEnd ) {
								deferred.notifyWith( elem, [ animation, 1, 0 ] );
								deferred.resolveWith( elem, [ animation, gotoEnd ] );
							} else {
								deferred.rejectWith( elem, [ animation, gotoEnd ] );
							}
							return this;
						}
					} ),
					props = animation.props;

				propFilter( props, animation.opts.specialEasing );

				for ( ; index < length; index++ ) {
					result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
					if ( result ) {
						if ( isFunction( result.stop ) ) {
							jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
								result.stop.bind( result );
						}
						return result;
					}
				}

				jQuery.map( props, createTween, animation );

				if ( isFunction( animation.opts.start ) ) {
					animation.opts.start.call( elem, animation );
				}

				// Attach callbacks from options
				animation
					.progress( animation.opts.progress )
					.done( animation.opts.done, animation.opts.complete )
					.fail( animation.opts.fail )
					.always( animation.opts.always );

				jQuery.fx.timer(
					jQuery.extend( tick, {
						elem: elem,
						anim: animation,
						queue: animation.opts.queue
					} )
				);

				return animation;
			}

			jQuery.Animation = jQuery.extend( Animation, {

				tweeners: {
					"*": [ function( prop, value ) {
						var tween = this.createTween( prop, value );
						adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
						return tween;
					} ]
				},

				tweener: function( props, callback ) {
					if ( isFunction( props ) ) {
						callback = props;
						props = [ "*" ];
					} else {
						props = props.match( rnothtmlwhite );
					}

					var prop,
						index = 0,
						length = props.length;

					for ( ; index < length; index++ ) {
						prop = props[ index ];
						Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
						Animation.tweeners[ prop ].unshift( callback );
					}
				},

				prefilters: [ defaultPrefilter ],

				prefilter: function( callback, prepend ) {
					if ( prepend ) {
						Animation.prefilters.unshift( callback );
					} else {
						Animation.prefilters.push( callback );
					}
				}
			} );

			jQuery.speed = function( speed, easing, fn ) {
				var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
					complete: fn || !fn && easing ||
						isFunction( speed ) && speed,
					duration: speed,
					easing: fn && easing || easing && !isFunction( easing ) && easing
				};

				// Go to the end state if fx are off
				if ( jQuery.fx.off ) {
					opt.duration = 0;

				} else {
					if ( typeof opt.duration !== "number" ) {
						if ( opt.duration in jQuery.fx.speeds ) {
							opt.duration = jQuery.fx.speeds[ opt.duration ];

						} else {
							opt.duration = jQuery.fx.speeds._default;
						}
					}
				}

				// Normalize opt.queue - true/undefined/null -> "fx"
				if ( opt.queue == null || opt.queue === true ) {
					opt.queue = "fx";
				}

				// Queueing
				opt.old = opt.complete;

				opt.complete = function() {
					if ( isFunction( opt.old ) ) {
						opt.old.call( this );
					}

					if ( opt.queue ) {
						jQuery.dequeue( this, opt.queue );
					}
				};

				return opt;
			};

			jQuery.fn.extend( {
				fadeTo: function( speed, to, easing, callback ) {

					// Show any hidden elements after setting opacity to 0
					return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

						// Animate to the value specified
						.end().animate( { opacity: to }, speed, easing, callback );
				},
				animate: function( prop, speed, easing, callback ) {
					var empty = jQuery.isEmptyObject( prop ),
						optall = jQuery.speed( speed, easing, callback ),
						doAnimation = function() {

							// Operate on a copy of prop so per-property easing won't be lost
							var anim = Animation( this, jQuery.extend( {}, prop ), optall );

							// Empty animations, or finishing resolves immediately
							if ( empty || dataPriv.get( this, "finish" ) ) {
								anim.stop( true );
							}
						};

					doAnimation.finish = doAnimation;

					return empty || optall.queue === false ?
						this.each( doAnimation ) :
						this.queue( optall.queue, doAnimation );
				},
				stop: function( type, clearQueue, gotoEnd ) {
					var stopQueue = function( hooks ) {
						var stop = hooks.stop;
						delete hooks.stop;
						stop( gotoEnd );
					};

					if ( typeof type !== "string" ) {
						gotoEnd = clearQueue;
						clearQueue = type;
						type = undefined;
					}
					if ( clearQueue ) {
						this.queue( type || "fx", [] );
					}

					return this.each( function() {
						var dequeue = true,
							index = type != null && type + "queueHooks",
							timers = jQuery.timers,
							data = dataPriv.get( this );

						if ( index ) {
							if ( data[ index ] && data[ index ].stop ) {
								stopQueue( data[ index ] );
							}
						} else {
							for ( index in data ) {
								if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
									stopQueue( data[ index ] );
								}
							}
						}

						for ( index = timers.length; index--; ) {
							if ( timers[ index ].elem === this &&
								( type == null || timers[ index ].queue === type ) ) {

								timers[ index ].anim.stop( gotoEnd );
								dequeue = false;
								timers.splice( index, 1 );
							}
						}

						// Start the next in the queue if the last step wasn't forced.
						// Timers currently will call their complete callbacks, which
						// will dequeue but only if they were gotoEnd.
						if ( dequeue || !gotoEnd ) {
							jQuery.dequeue( this, type );
						}
					} );
				},
				finish: function( type ) {
					if ( type !== false ) {
						type = type || "fx";
					}
					return this.each( function() {
						var index,
							data = dataPriv.get( this ),
							queue = data[ type + "queue" ],
							hooks = data[ type + "queueHooks" ],
							timers = jQuery.timers,
							length = queue ? queue.length : 0;

						// Enable finishing flag on private data
						data.finish = true;

						// Empty the queue first
						jQuery.queue( this, type, [] );

						if ( hooks && hooks.stop ) {
							hooks.stop.call( this, true );
						}

						// Look for any active animations, and finish them
						for ( index = timers.length; index--; ) {
							if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
								timers[ index ].anim.stop( true );
								timers.splice( index, 1 );
							}
						}

						// Look for any animations in the old queue and finish them
						for ( index = 0; index < length; index++ ) {
							if ( queue[ index ] && queue[ index ].finish ) {
								queue[ index ].finish.call( this );
							}
						}

						// Turn off finishing flag
						delete data.finish;
					} );
				}
			} );

			jQuery.each( [ "toggle", "show", "hide" ], function( _i, name ) {
				var cssFn = jQuery.fn[ name ];
				jQuery.fn[ name ] = function( speed, easing, callback ) {
					return speed == null || typeof speed === "boolean" ?
						cssFn.apply( this, arguments ) :
						this.animate( genFx( name, true ), speed, easing, callback );
				};
			} );

			// Generate shortcuts for custom animations
			jQuery.each( {
				slideDown: genFx( "show" ),
				slideUp: genFx( "hide" ),
				slideToggle: genFx( "toggle" ),
				fadeIn: { opacity: "show" },
				fadeOut: { opacity: "hide" },
				fadeToggle: { opacity: "toggle" }
			}, function( name, props ) {
				jQuery.fn[ name ] = function( speed, easing, callback ) {
					return this.animate( props, speed, easing, callback );
				};
			} );

			jQuery.timers = [];
			jQuery.fx.tick = function() {
				var timer,
					i = 0,
					timers = jQuery.timers;

				fxNow = Date.now();

				for ( ; i < timers.length; i++ ) {
					timer = timers[ i ];

					// Run the timer and safely remove it when done (allowing for external removal)
					if ( !timer() && timers[ i ] === timer ) {
						timers.splice( i--, 1 );
					}
				}

				if ( !timers.length ) {
					jQuery.fx.stop();
				}
				fxNow = undefined;
			};

			jQuery.fx.timer = function( timer ) {
				jQuery.timers.push( timer );
				jQuery.fx.start();
			};

			jQuery.fx.interval = 13;
			jQuery.fx.start = function() {
				if ( inProgress ) {
					return;
				}

				inProgress = true;
				schedule();
			};

			jQuery.fx.stop = function() {
				inProgress = null;
			};

			jQuery.fx.speeds = {
				slow: 600,
				fast: 200,

				// Default speed
				_default: 400
			};


			// Based off of the plugin by Clint Helfers, with permission.
			jQuery.fn.delay = function( time, type ) {
				time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
				type = type || "fx";

				return this.queue( type, function( next, hooks ) {
					var timeout = window.setTimeout( next, time );
					hooks.stop = function() {
						window.clearTimeout( timeout );
					};
				} );
			};


			( function() {
				var input = document.createElement( "input" ),
					select = document.createElement( "select" ),
					opt = select.appendChild( document.createElement( "option" ) );

				input.type = "checkbox";

				// Support: Android <=4.3 only
				// Default value for a checkbox should be "on"
				support.checkOn = input.value !== "";

				// Support: IE <=11 only
				// Must access selectedIndex to make default options select
				support.optSelected = opt.selected;

				// Support: IE <=11 only
				// An input loses its value after becoming a radio
				input = document.createElement( "input" );
				input.value = "t";
				input.type = "radio";
				support.radioValue = input.value === "t";
			} )();


			var boolHook,
				attrHandle = jQuery.expr.attrHandle;

			jQuery.fn.extend( {
				attr: function( name, value ) {
					return access( this, jQuery.attr, name, value, arguments.length > 1 );
				},

				removeAttr: function( name ) {
					return this.each( function() {
						jQuery.removeAttr( this, name );
					} );
				}
			} );

			jQuery.extend( {
				attr: function( elem, name, value ) {
					var ret, hooks,
						nType = elem.nodeType;

					// Don't get/set attributes on text, comment and attribute nodes
					if ( nType === 3 || nType === 8 || nType === 2 ) {
						return;
					}

					// Fallback to prop when attributes are not supported
					if ( typeof elem.getAttribute === "undefined" ) {
						return jQuery.prop( elem, name, value );
					}

					// Attribute hooks are determined by the lowercase version
					// Grab necessary hook if one is defined
					if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
						hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
							( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
					}

					if ( value !== undefined ) {
						if ( value === null ) {
							jQuery.removeAttr( elem, name );
							return;
						}

						if ( hooks && "set" in hooks &&
							( ret = hooks.set( elem, value, name ) ) !== undefined ) {
							return ret;
						}

						elem.setAttribute( name, value + "" );
						return value;
					}

					if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
						return ret;
					}

					ret = jQuery.find.attr( elem, name );

					// Non-existent attributes return null, we normalize to undefined
					return ret == null ? undefined : ret;
				},

				attrHooks: {
					type: {
						set: function( elem, value ) {
							if ( !support.radioValue && value === "radio" &&
								nodeName( elem, "input" ) ) {
								var val = elem.value;
								elem.setAttribute( "type", value );
								if ( val ) {
									elem.value = val;
								}
								return value;
							}
						}
					}
				},

				removeAttr: function( elem, value ) {
					var name,
						i = 0,

						// Attribute names can contain non-HTML whitespace characters
						// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
						attrNames = value && value.match( rnothtmlwhite );

					if ( attrNames && elem.nodeType === 1 ) {
						while ( ( name = attrNames[ i++ ] ) ) {
							elem.removeAttribute( name );
						}
					}
				}
			} );

			// Hooks for boolean attributes
			boolHook = {
				set: function( elem, value, name ) {
					if ( value === false ) {

						// Remove boolean attributes when set to false
						jQuery.removeAttr( elem, name );
					} else {
						elem.setAttribute( name, name );
					}
					return name;
				}
			};

			jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( _i, name ) {
				var getter = attrHandle[ name ] || jQuery.find.attr;

				attrHandle[ name ] = function( elem, name, isXML ) {
					var ret, handle,
						lowercaseName = name.toLowerCase();

					if ( !isXML ) {

						// Avoid an infinite loop by temporarily removing this function from the getter
						handle = attrHandle[ lowercaseName ];
						attrHandle[ lowercaseName ] = ret;
						ret = getter( elem, name, isXML ) != null ?
							lowercaseName :
							null;
						attrHandle[ lowercaseName ] = handle;
					}
					return ret;
				};
			} );




			var rfocusable = /^(?:input|select|textarea|button)$/i,
				rclickable = /^(?:a|area)$/i;

			jQuery.fn.extend( {
				prop: function( name, value ) {
					return access( this, jQuery.prop, name, value, arguments.length > 1 );
				},

				removeProp: function( name ) {
					return this.each( function() {
						delete this[ jQuery.propFix[ name ] || name ];
					} );
				}
			} );

			jQuery.extend( {
				prop: function( elem, name, value ) {
					var ret, hooks,
						nType = elem.nodeType;

					// Don't get/set properties on text, comment and attribute nodes
					if ( nType === 3 || nType === 8 || nType === 2 ) {
						return;
					}

					if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

						// Fix name and attach hooks
						name = jQuery.propFix[ name ] || name;
						hooks = jQuery.propHooks[ name ];
					}

					if ( value !== undefined ) {
						if ( hooks && "set" in hooks &&
							( ret = hooks.set( elem, value, name ) ) !== undefined ) {
							return ret;
						}

						return ( elem[ name ] = value );
					}

					if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
						return ret;
					}

					return elem[ name ];
				},

				propHooks: {
					tabIndex: {
						get: function( elem ) {

							// Support: IE <=9 - 11 only
							// elem.tabIndex doesn't always return the
							// correct value when it hasn't been explicitly set
							// Use proper attribute retrieval (trac-12072)
							var tabindex = jQuery.find.attr( elem, "tabindex" );

							if ( tabindex ) {
								return parseInt( tabindex, 10 );
							}

							if (
								rfocusable.test( elem.nodeName ) ||
								rclickable.test( elem.nodeName ) &&
								elem.href
							) {
								return 0;
							}

							return -1;
						}
					}
				},

				propFix: {
					"for": "htmlFor",
					"class": "className"
				}
			} );

			// Support: IE <=11 only
			// Accessing the selectedIndex property
			// forces the browser to respect setting selected
			// on the option
			// The getter ensures a default option is selected
			// when in an optgroup
			// eslint rule "no-unused-expressions" is disabled for this code
			// since it considers such accessions noop
			if ( !support.optSelected ) {
				jQuery.propHooks.selected = {
					get: function( elem ) {

						/* eslint no-unused-expressions: "off" */

						var parent = elem.parentNode;
						if ( parent && parent.parentNode ) {
							parent.parentNode.selectedIndex;
						}
						return null;
					},
					set: function( elem ) {

						/* eslint no-unused-expressions: "off" */

						var parent = elem.parentNode;
						if ( parent ) {
							parent.selectedIndex;

							if ( parent.parentNode ) {
								parent.parentNode.selectedIndex;
							}
						}
					}
				};
			}

			jQuery.each( [
				"tabIndex",
				"readOnly",
				"maxLength",
				"cellSpacing",
				"cellPadding",
				"rowSpan",
				"colSpan",
				"useMap",
				"frameBorder",
				"contentEditable"
			], function() {
				jQuery.propFix[ this.toLowerCase() ] = this;
			} );




				// Strip and collapse whitespace according to HTML spec
				// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
				function stripAndCollapse( value ) {
					var tokens = value.match( rnothtmlwhite ) || [];
					return tokens.join( " " );
				}


			function getClass( elem ) {
				return elem.getAttribute && elem.getAttribute( "class" ) || "";
			}

			function classesToArray( value ) {
				if ( Array.isArray( value ) ) {
					return value;
				}
				if ( typeof value === "string" ) {
					return value.match( rnothtmlwhite ) || [];
				}
				return [];
			}

			jQuery.fn.extend( {
				addClass: function( value ) {
					var classNames, cur, curValue, className, i, finalValue;

					if ( isFunction( value ) ) {
						return this.each( function( j ) {
							jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
						} );
					}

					classNames = classesToArray( value );

					if ( classNames.length ) {
						return this.each( function() {
							curValue = getClass( this );
							cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

							if ( cur ) {
								for ( i = 0; i < classNames.length; i++ ) {
									className = classNames[ i ];
									if ( cur.indexOf( " " + className + " " ) < 0 ) {
										cur += className + " ";
									}
								}

								// Only assign if different to avoid unneeded rendering.
								finalValue = stripAndCollapse( cur );
								if ( curValue !== finalValue ) {
									this.setAttribute( "class", finalValue );
								}
							}
						} );
					}

					return this;
				},

				removeClass: function( value ) {
					var classNames, cur, curValue, className, i, finalValue;

					if ( isFunction( value ) ) {
						return this.each( function( j ) {
							jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
						} );
					}

					if ( !arguments.length ) {
						return this.attr( "class", "" );
					}

					classNames = classesToArray( value );

					if ( classNames.length ) {
						return this.each( function() {
							curValue = getClass( this );

							// This expression is here for better compressibility (see addClass)
							cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

							if ( cur ) {
								for ( i = 0; i < classNames.length; i++ ) {
									className = classNames[ i ];

									// Remove *all* instances
									while ( cur.indexOf( " " + className + " " ) > -1 ) {
										cur = cur.replace( " " + className + " ", " " );
									}
								}

								// Only assign if different to avoid unneeded rendering.
								finalValue = stripAndCollapse( cur );
								if ( curValue !== finalValue ) {
									this.setAttribute( "class", finalValue );
								}
							}
						} );
					}

					return this;
				},

				toggleClass: function( value, stateVal ) {
					var classNames, className, i, self,
						type = typeof value,
						isValidValue = type === "string" || Array.isArray( value );

					if ( isFunction( value ) ) {
						return this.each( function( i ) {
							jQuery( this ).toggleClass(
								value.call( this, i, getClass( this ), stateVal ),
								stateVal
							);
						} );
					}

					if ( typeof stateVal === "boolean" && isValidValue ) {
						return stateVal ? this.addClass( value ) : this.removeClass( value );
					}

					classNames = classesToArray( value );

					return this.each( function() {
						if ( isValidValue ) {

							// Toggle individual class names
							self = jQuery( this );

							for ( i = 0; i < classNames.length; i++ ) {
								className = classNames[ i ];

								// Check each className given, space separated list
								if ( self.hasClass( className ) ) {
									self.removeClass( className );
								} else {
									self.addClass( className );
								}
							}

						// Toggle whole class name
						} else if ( value === undefined || type === "boolean" ) {
							className = getClass( this );
							if ( className ) {

								// Store className if set
								dataPriv.set( this, "__className__", className );
							}

							// If the element has a class name or if we're passed `false`,
							// then remove the whole classname (if there was one, the above saved it).
							// Otherwise bring back whatever was previously saved (if anything),
							// falling back to the empty string if nothing was stored.
							if ( this.setAttribute ) {
								this.setAttribute( "class",
									className || value === false ?
										"" :
										dataPriv.get( this, "__className__" ) || ""
								);
							}
						}
					} );
				},

				hasClass: function( selector ) {
					var className, elem,
						i = 0;

					className = " " + selector + " ";
					while ( ( elem = this[ i++ ] ) ) {
						if ( elem.nodeType === 1 &&
							( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
							return true;
						}
					}

					return false;
				}
			} );




			var rreturn = /\r/g;

			jQuery.fn.extend( {
				val: function( value ) {
					var hooks, ret, valueIsFunction,
						elem = this[ 0 ];

					if ( !arguments.length ) {
						if ( elem ) {
							hooks = jQuery.valHooks[ elem.type ] ||
								jQuery.valHooks[ elem.nodeName.toLowerCase() ];

							if ( hooks &&
								"get" in hooks &&
								( ret = hooks.get( elem, "value" ) ) !== undefined
							) {
								return ret;
							}

							ret = elem.value;

							// Handle most common string cases
							if ( typeof ret === "string" ) {
								return ret.replace( rreturn, "" );
							}

							// Handle cases where value is null/undef or number
							return ret == null ? "" : ret;
						}

						return;
					}

					valueIsFunction = isFunction( value );

					return this.each( function( i ) {
						var val;

						if ( this.nodeType !== 1 ) {
							return;
						}

						if ( valueIsFunction ) {
							val = value.call( this, i, jQuery( this ).val() );
						} else {
							val = value;
						}

						// Treat null/undefined as ""; convert numbers to string
						if ( val == null ) {
							val = "";

						} else if ( typeof val === "number" ) {
							val += "";

						} else if ( Array.isArray( val ) ) {
							val = jQuery.map( val, function( value ) {
								return value == null ? "" : value + "";
							} );
						}

						hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

						// If set returns undefined, fall back to normal setting
						if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
							this.value = val;
						}
					} );
				}
			} );

			jQuery.extend( {
				valHooks: {
					option: {
						get: function( elem ) {

							var val = jQuery.find.attr( elem, "value" );
							return val != null ?
								val :

								// Support: IE <=10 - 11 only
								// option.text throws exceptions (trac-14686, trac-14858)
								// Strip and collapse whitespace
								// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
								stripAndCollapse( jQuery.text( elem ) );
						}
					},
					select: {
						get: function( elem ) {
							var value, option, i,
								options = elem.options,
								index = elem.selectedIndex,
								one = elem.type === "select-one",
								values = one ? null : [],
								max = one ? index + 1 : options.length;

							if ( index < 0 ) {
								i = max;

							} else {
								i = one ? index : 0;
							}

							// Loop through all the selected options
							for ( ; i < max; i++ ) {
								option = options[ i ];

								// Support: IE <=9 only
								// IE8-9 doesn't update selected after form reset (trac-2551)
								if ( ( option.selected || i === index ) &&

										// Don't return options that are disabled or in a disabled optgroup
										!option.disabled &&
										( !option.parentNode.disabled ||
											!nodeName( option.parentNode, "optgroup" ) ) ) {

									// Get the specific value for the option
									value = jQuery( option ).val();

									// We don't need an array for one selects
									if ( one ) {
										return value;
									}

									// Multi-Selects return an array
									values.push( value );
								}
							}

							return values;
						},

						set: function( elem, value ) {
							var optionSet, option,
								options = elem.options,
								values = jQuery.makeArray( value ),
								i = options.length;

							while ( i-- ) {
								option = options[ i ];

								/* eslint-disable no-cond-assign */

								if ( option.selected =
									jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
								) {
									optionSet = true;
								}

								/* eslint-enable no-cond-assign */
							}

							// Force browsers to behave consistently when non-matching value is set
							if ( !optionSet ) {
								elem.selectedIndex = -1;
							}
							return values;
						}
					}
				}
			} );

			// Radios and checkboxes getter/setter
			jQuery.each( [ "radio", "checkbox" ], function() {
				jQuery.valHooks[ this ] = {
					set: function( elem, value ) {
						if ( Array.isArray( value ) ) {
							return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
						}
					}
				};
				if ( !support.checkOn ) {
					jQuery.valHooks[ this ].get = function( elem ) {
						return elem.getAttribute( "value" ) === null ? "on" : elem.value;
					};
				}
			} );




			// Return jQuery for attributes-only inclusion
			var location = window.location;

			var nonce = { guid: Date.now() };

			var rquery = ( /\?/ );



			// Cross-browser xml parsing
			jQuery.parseXML = function( data ) {
				var xml, parserErrorElem;
				if ( !data || typeof data !== "string" ) {
					return null;
				}

				// Support: IE 9 - 11 only
				// IE throws on parseFromString with invalid input.
				try {
					xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
				} catch ( e ) {}

				parserErrorElem = xml && xml.getElementsByTagName( "parsererror" )[ 0 ];
				if ( !xml || parserErrorElem ) {
					jQuery.error( "Invalid XML: " + (
						parserErrorElem ?
							jQuery.map( parserErrorElem.childNodes, function( el ) {
								return el.textContent;
							} ).join( "\n" ) :
							data
					) );
				}
				return xml;
			};


			var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
				stopPropagationCallback = function( e ) {
					e.stopPropagation();
				};

			jQuery.extend( jQuery.event, {

				trigger: function( event, data, elem, onlyHandlers ) {

					var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
						eventPath = [ elem || document ],
						type = hasOwn.call( event, "type" ) ? event.type : event,
						namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

					cur = lastElement = tmp = elem = elem || document;

					// Don't do events on text and comment nodes
					if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
						return;
					}

					// focus/blur morphs to focusin/out; ensure we're not firing them right now
					if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
						return;
					}

					if ( type.indexOf( "." ) > -1 ) {

						// Namespaced trigger; create a regexp to match event type in handle()
						namespaces = type.split( "." );
						type = namespaces.shift();
						namespaces.sort();
					}
					ontype = type.indexOf( ":" ) < 0 && "on" + type;

					// Caller can pass in a jQuery.Event object, Object, or just an event type string
					event = event[ jQuery.expando ] ?
						event :
						new jQuery.Event( type, typeof event === "object" && event );

					// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
					event.isTrigger = onlyHandlers ? 2 : 3;
					event.namespace = namespaces.join( "." );
					event.rnamespace = event.namespace ?
						new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
						null;

					// Clean up the event in case it is being reused
					event.result = undefined;
					if ( !event.target ) {
						event.target = elem;
					}

					// Clone any incoming data and prepend the event, creating the handler arg list
					data = data == null ?
						[ event ] :
						jQuery.makeArray( data, [ event ] );

					// Allow special events to draw outside the lines
					special = jQuery.event.special[ type ] || {};
					if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
						return;
					}

					// Determine event propagation path in advance, per W3C events spec (trac-9951)
					// Bubble up to document, then to window; watch for a global ownerDocument var (trac-9724)
					if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

						bubbleType = special.delegateType || type;
						if ( !rfocusMorph.test( bubbleType + type ) ) {
							cur = cur.parentNode;
						}
						for ( ; cur; cur = cur.parentNode ) {
							eventPath.push( cur );
							tmp = cur;
						}

						// Only add window if we got to document (e.g., not plain obj or detached DOM)
						if ( tmp === ( elem.ownerDocument || document ) ) {
							eventPath.push( tmp.defaultView || tmp.parentWindow || window );
						}
					}

					// Fire handlers on the event path
					i = 0;
					while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
						lastElement = cur;
						event.type = i > 1 ?
							bubbleType :
							special.bindType || type;

						// jQuery handler
						handle = ( dataPriv.get( cur, "events" ) || Object.create( null ) )[ event.type ] &&
							dataPriv.get( cur, "handle" );
						if ( handle ) {
							handle.apply( cur, data );
						}

						// Native handler
						handle = ontype && cur[ ontype ];
						if ( handle && handle.apply && acceptData( cur ) ) {
							event.result = handle.apply( cur, data );
							if ( event.result === false ) {
								event.preventDefault();
							}
						}
					}
					event.type = type;

					// If nobody prevented the default action, do it now
					if ( !onlyHandlers && !event.isDefaultPrevented() ) {

						if ( ( !special._default ||
							special._default.apply( eventPath.pop(), data ) === false ) &&
							acceptData( elem ) ) {

							// Call a native DOM method on the target with the same name as the event.
							// Don't do default actions on window, that's where global variables be (trac-6170)
							if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

								// Don't re-trigger an onFOO event when we call its FOO() method
								tmp = elem[ ontype ];

								if ( tmp ) {
									elem[ ontype ] = null;
								}

								// Prevent re-triggering of the same event, since we already bubbled it above
								jQuery.event.triggered = type;

								if ( event.isPropagationStopped() ) {
									lastElement.addEventListener( type, stopPropagationCallback );
								}

								elem[ type ]();

								if ( event.isPropagationStopped() ) {
									lastElement.removeEventListener( type, stopPropagationCallback );
								}

								jQuery.event.triggered = undefined;

								if ( tmp ) {
									elem[ ontype ] = tmp;
								}
							}
						}
					}

					return event.result;
				},

				// Piggyback on a donor event to simulate a different one
				// Used only for `focus(in | out)` events
				simulate: function( type, elem, event ) {
					var e = jQuery.extend(
						new jQuery.Event(),
						event,
						{
							type: type,
							isSimulated: true
						}
					);

					jQuery.event.trigger( e, null, elem );
				}

			} );

			jQuery.fn.extend( {

				trigger: function( type, data ) {
					return this.each( function() {
						jQuery.event.trigger( type, data, this );
					} );
				},
				triggerHandler: function( type, data ) {
					var elem = this[ 0 ];
					if ( elem ) {
						return jQuery.event.trigger( type, data, elem, true );
					}
				}
			} );


			var
				rbracket = /\[\]$/,
				rCRLF = /\r?\n/g,
				rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
				rsubmittable = /^(?:input|select|textarea|keygen)/i;

			function buildParams( prefix, obj, traditional, add ) {
				var name;

				if ( Array.isArray( obj ) ) {

					// Serialize array item.
					jQuery.each( obj, function( i, v ) {
						if ( traditional || rbracket.test( prefix ) ) {

							// Treat each array item as a scalar.
							add( prefix, v );

						} else {

							// Item is non-scalar (array or object), encode its numeric index.
							buildParams(
								prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
								v,
								traditional,
								add
							);
						}
					} );

				} else if ( !traditional && toType( obj ) === "object" ) {

					// Serialize object item.
					for ( name in obj ) {
						buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
					}

				} else {

					// Serialize scalar item.
					add( prefix, obj );
				}
			}

			// Serialize an array of form elements or a set of
			// key/values into a query string
			jQuery.param = function( a, traditional ) {
				var prefix,
					s = [],
					add = function( key, valueOrFunction ) {

						// If value is a function, invoke it and use its return value
						var value = isFunction( valueOrFunction ) ?
							valueOrFunction() :
							valueOrFunction;

						s[ s.length ] = encodeURIComponent( key ) + "=" +
							encodeURIComponent( value == null ? "" : value );
					};

				if ( a == null ) {
					return "";
				}

				// If an array was passed in, assume that it is an array of form elements.
				if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

					// Serialize the form elements
					jQuery.each( a, function() {
						add( this.name, this.value );
					} );

				} else {

					// If traditional, encode the "old" way (the way 1.3.2 or older
					// did it), otherwise encode params recursively.
					for ( prefix in a ) {
						buildParams( prefix, a[ prefix ], traditional, add );
					}
				}

				// Return the resulting serialization
				return s.join( "&" );
			};

			jQuery.fn.extend( {
				serialize: function() {
					return jQuery.param( this.serializeArray() );
				},
				serializeArray: function() {
					return this.map( function() {

						// Can add propHook for "elements" to filter or add form elements
						var elements = jQuery.prop( this, "elements" );
						return elements ? jQuery.makeArray( elements ) : this;
					} ).filter( function() {
						var type = this.type;

						// Use .is( ":disabled" ) so that fieldset[disabled] works
						return this.name && !jQuery( this ).is( ":disabled" ) &&
							rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
							( this.checked || !rcheckableType.test( type ) );
					} ).map( function( _i, elem ) {
						var val = jQuery( this ).val();

						if ( val == null ) {
							return null;
						}

						if ( Array.isArray( val ) ) {
							return jQuery.map( val, function( val ) {
								return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
							} );
						}

						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					} ).get();
				}
			} );


			var
				r20 = /%20/g,
				rhash = /#.*$/,
				rantiCache = /([?&])_=[^&]*/,
				rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

				// trac-7653, trac-8125, trac-8152: local protocol detection
				rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
				rnoContent = /^(?:GET|HEAD)$/,
				rprotocol = /^\/\//,

				/* Prefilters
				 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
				 * 2) These are called:
				 *    - BEFORE asking for a transport
				 *    - AFTER param serialization (s.data is a string if s.processData is true)
				 * 3) key is the dataType
				 * 4) the catchall symbol "*" can be used
				 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
				 */
				prefilters = {},

				/* Transports bindings
				 * 1) key is the dataType
				 * 2) the catchall symbol "*" can be used
				 * 3) selection will start with transport dataType and THEN go to "*" if needed
				 */
				transports = {},

				// Avoid comment-prolog char sequence (trac-10098); must appease lint and evade compression
				allTypes = "*/".concat( "*" ),

				// Anchor tag for parsing the document origin
				originAnchor = document.createElement( "a" );

			originAnchor.href = location.href;

			// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
			function addToPrefiltersOrTransports( structure ) {

				// dataTypeExpression is optional and defaults to "*"
				return function( dataTypeExpression, func ) {

					if ( typeof dataTypeExpression !== "string" ) {
						func = dataTypeExpression;
						dataTypeExpression = "*";
					}

					var dataType,
						i = 0,
						dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

					if ( isFunction( func ) ) {

						// For each dataType in the dataTypeExpression
						while ( ( dataType = dataTypes[ i++ ] ) ) {

							// Prepend if requested
							if ( dataType[ 0 ] === "+" ) {
								dataType = dataType.slice( 1 ) || "*";
								( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

							// Otherwise append
							} else {
								( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
							}
						}
					}
				};
			}

			// Base inspection function for prefilters and transports
			function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

				var inspected = {},
					seekingTransport = ( structure === transports );

				function inspect( dataType ) {
					var selected;
					inspected[ dataType ] = true;
					jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
						var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
						if ( typeof dataTypeOrTransport === "string" &&
							!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

							options.dataTypes.unshift( dataTypeOrTransport );
							inspect( dataTypeOrTransport );
							return false;
						} else if ( seekingTransport ) {
							return !( selected = dataTypeOrTransport );
						}
					} );
					return selected;
				}

				return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
			}

			// A special extend for ajax options
			// that takes "flat" options (not to be deep extended)
			// Fixes trac-9887
			function ajaxExtend( target, src ) {
				var key, deep,
					flatOptions = jQuery.ajaxSettings.flatOptions || {};

				for ( key in src ) {
					if ( src[ key ] !== undefined ) {
						( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
					}
				}
				if ( deep ) {
					jQuery.extend( true, target, deep );
				}

				return target;
			}

			/* Handles responses to an ajax request:
			 * - finds the right dataType (mediates between content-type and expected dataType)
			 * - returns the corresponding response
			 */
			function ajaxHandleResponses( s, jqXHR, responses ) {

				var ct, type, finalDataType, firstDataType,
					contents = s.contents,
					dataTypes = s.dataTypes;

				// Remove auto dataType and get content-type in the process
				while ( dataTypes[ 0 ] === "*" ) {
					dataTypes.shift();
					if ( ct === undefined ) {
						ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
					}
				}

				// Check if we're dealing with a known content-type
				if ( ct ) {
					for ( type in contents ) {
						if ( contents[ type ] && contents[ type ].test( ct ) ) {
							dataTypes.unshift( type );
							break;
						}
					}
				}

				// Check to see if we have a response for the expected dataType
				if ( dataTypes[ 0 ] in responses ) {
					finalDataType = dataTypes[ 0 ];
				} else {

					// Try convertible dataTypes
					for ( type in responses ) {
						if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
							finalDataType = type;
							break;
						}
						if ( !firstDataType ) {
							firstDataType = type;
						}
					}

					// Or just use first one
					finalDataType = finalDataType || firstDataType;
				}

				// If we found a dataType
				// We add the dataType to the list if needed
				// and return the corresponding response
				if ( finalDataType ) {
					if ( finalDataType !== dataTypes[ 0 ] ) {
						dataTypes.unshift( finalDataType );
					}
					return responses[ finalDataType ];
				}
			}

			/* Chain conversions given the request and the original response
			 * Also sets the responseXXX fields on the jqXHR instance
			 */
			function ajaxConvert( s, response, jqXHR, isSuccess ) {
				var conv2, current, conv, tmp, prev,
					converters = {},

					// Work with a copy of dataTypes in case we need to modify it for conversion
					dataTypes = s.dataTypes.slice();

				// Create converters map with lowercased keys
				if ( dataTypes[ 1 ] ) {
					for ( conv in s.converters ) {
						converters[ conv.toLowerCase() ] = s.converters[ conv ];
					}
				}

				current = dataTypes.shift();

				// Convert to each sequential dataType
				while ( current ) {

					if ( s.responseFields[ current ] ) {
						jqXHR[ s.responseFields[ current ] ] = response;
					}

					// Apply the dataFilter if provided
					if ( !prev && isSuccess && s.dataFilter ) {
						response = s.dataFilter( response, s.dataType );
					}

					prev = current;
					current = dataTypes.shift();

					if ( current ) {

						// There's only work to do if current dataType is non-auto
						if ( current === "*" ) {

							current = prev;

						// Convert response if prev dataType is non-auto and differs from current
						} else if ( prev !== "*" && prev !== current ) {

							// Seek a direct converter
							conv = converters[ prev + " " + current ] || converters[ "* " + current ];

							// If none found, seek a pair
							if ( !conv ) {
								for ( conv2 in converters ) {

									// If conv2 outputs current
									tmp = conv2.split( " " );
									if ( tmp[ 1 ] === current ) {

										// If prev can be converted to accepted input
										conv = converters[ prev + " " + tmp[ 0 ] ] ||
											converters[ "* " + tmp[ 0 ] ];
										if ( conv ) {

											// Condense equivalence converters
											if ( conv === true ) {
												conv = converters[ conv2 ];

											// Otherwise, insert the intermediate dataType
											} else if ( converters[ conv2 ] !== true ) {
												current = tmp[ 0 ];
												dataTypes.unshift( tmp[ 1 ] );
											}
											break;
										}
									}
								}
							}

							// Apply converter (if not an equivalence)
							if ( conv !== true ) {

								// Unless errors are allowed to bubble, catch and return them
								if ( conv && s.throws ) {
									response = conv( response );
								} else {
									try {
										response = conv( response );
									} catch ( e ) {
										return {
											state: "parsererror",
											error: conv ? e : "No conversion from " + prev + " to " + current
										};
									}
								}
							}
						}
					}
				}

				return { state: "success", data: response };
			}

			jQuery.extend( {

				// Counter for holding the number of active queries
				active: 0,

				// Last-Modified header cache for next request
				lastModified: {},
				etag: {},

				ajaxSettings: {
					url: location.href,
					type: "GET",
					isLocal: rlocalProtocol.test( location.protocol ),
					global: true,
					processData: true,
					async: true,
					contentType: "application/x-www-form-urlencoded; charset=UTF-8",

					/*
					timeout: 0,
					data: null,
					dataType: null,
					username: null,
					password: null,
					cache: null,
					throws: false,
					traditional: false,
					headers: {},
					*/

					accepts: {
						"*": allTypes,
						text: "text/plain",
						html: "text/html",
						xml: "application/xml, text/xml",
						json: "application/json, text/javascript"
					},

					contents: {
						xml: /\bxml\b/,
						html: /\bhtml/,
						json: /\bjson\b/
					},

					responseFields: {
						xml: "responseXML",
						text: "responseText",
						json: "responseJSON"
					},

					// Data converters
					// Keys separate source (or catchall "*") and destination types with a single space
					converters: {

						// Convert anything to text
						"* text": String,

						// Text to html (true = no transformation)
						"text html": true,

						// Evaluate text as a json expression
						"text json": JSON.parse,

						// Parse text as xml
						"text xml": jQuery.parseXML
					},

					// For options that shouldn't be deep extended:
					// you can add your own custom options here if
					// and when you create one that shouldn't be
					// deep extended (see ajaxExtend)
					flatOptions: {
						url: true,
						context: true
					}
				},

				// Creates a full fledged settings object into target
				// with both ajaxSettings and settings fields.
				// If target is omitted, writes into ajaxSettings.
				ajaxSetup: function( target, settings ) {
					return settings ?

						// Building a settings object
						ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

						// Extending ajaxSettings
						ajaxExtend( jQuery.ajaxSettings, target );
				},

				ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
				ajaxTransport: addToPrefiltersOrTransports( transports ),

				// Main method
				ajax: function( url, options ) {

					// If url is an object, simulate pre-1.5 signature
					if ( typeof url === "object" ) {
						options = url;
						url = undefined;
					}

					// Force options to be an object
					options = options || {};

					var transport,

						// URL without anti-cache param
						cacheURL,

						// Response headers
						responseHeadersString,
						responseHeaders,

						// timeout handle
						timeoutTimer,

						// Url cleanup var
						urlAnchor,

						// Request state (becomes false upon send and true upon completion)
						completed,

						// To know if global events are to be dispatched
						fireGlobals,

						// Loop variable
						i,

						// uncached part of the url
						uncached,

						// Create the final options object
						s = jQuery.ajaxSetup( {}, options ),

						// Callbacks context
						callbackContext = s.context || s,

						// Context for global events is callbackContext if it is a DOM node or jQuery collection
						globalEventContext = s.context &&
							( callbackContext.nodeType || callbackContext.jquery ) ?
							jQuery( callbackContext ) :
							jQuery.event,

						// Deferreds
						deferred = jQuery.Deferred(),
						completeDeferred = jQuery.Callbacks( "once memory" ),

						// Status-dependent callbacks
						statusCode = s.statusCode || {},

						// Headers (they are sent all at once)
						requestHeaders = {},
						requestHeadersNames = {},

						// Default abort message
						strAbort = "canceled",

						// Fake xhr
						jqXHR = {
							readyState: 0,

							// Builds headers hashtable if needed
							getResponseHeader: function( key ) {
								var match;
								if ( completed ) {
									if ( !responseHeaders ) {
										responseHeaders = {};
										while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
											responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
												( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
													.concat( match[ 2 ] );
										}
									}
									match = responseHeaders[ key.toLowerCase() + " " ];
								}
								return match == null ? null : match.join( ", " );
							},

							// Raw string
							getAllResponseHeaders: function() {
								return completed ? responseHeadersString : null;
							},

							// Caches the header
							setRequestHeader: function( name, value ) {
								if ( completed == null ) {
									name = requestHeadersNames[ name.toLowerCase() ] =
										requestHeadersNames[ name.toLowerCase() ] || name;
									requestHeaders[ name ] = value;
								}
								return this;
							},

							// Overrides response content-type header
							overrideMimeType: function( type ) {
								if ( completed == null ) {
									s.mimeType = type;
								}
								return this;
							},

							// Status-dependent callbacks
							statusCode: function( map ) {
								var code;
								if ( map ) {
									if ( completed ) {

										// Execute the appropriate callbacks
										jqXHR.always( map[ jqXHR.status ] );
									} else {

										// Lazy-add the new callbacks in a way that preserves old ones
										for ( code in map ) {
											statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
										}
									}
								}
								return this;
							},

							// Cancel the request
							abort: function( statusText ) {
								var finalText = statusText || strAbort;
								if ( transport ) {
									transport.abort( finalText );
								}
								done( 0, finalText );
								return this;
							}
						};

					// Attach deferreds
					deferred.promise( jqXHR );

					// Add protocol if not provided (prefilters might expect it)
					// Handle falsy url in the settings object (trac-10093: consistency with old signature)
					// We also use the url parameter if available
					s.url = ( ( url || s.url || location.href ) + "" )
						.replace( rprotocol, location.protocol + "//" );

					// Alias method option to type as per ticket trac-12004
					s.type = options.method || options.type || s.method || s.type;

					// Extract dataTypes list
					s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

					// A cross-domain request is in order when the origin doesn't match the current origin.
					if ( s.crossDomain == null ) {
						urlAnchor = document.createElement( "a" );

						// Support: IE <=8 - 11, Edge 12 - 15
						// IE throws exception on accessing the href property if url is malformed,
						// e.g. http://example.com:80x/
						try {
							urlAnchor.href = s.url;

							// Support: IE <=8 - 11 only
							// Anchor's host property isn't correctly set when s.url is relative
							urlAnchor.href = urlAnchor.href;
							s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
								urlAnchor.protocol + "//" + urlAnchor.host;
						} catch ( e ) {

							// If there is an error parsing the URL, assume it is crossDomain,
							// it can be rejected by the transport if it is invalid
							s.crossDomain = true;
						}
					}

					// Convert data if not already a string
					if ( s.data && s.processData && typeof s.data !== "string" ) {
						s.data = jQuery.param( s.data, s.traditional );
					}

					// Apply prefilters
					inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

					// If request was aborted inside a prefilter, stop there
					if ( completed ) {
						return jqXHR;
					}

					// We can fire global events as of now if asked to
					// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (trac-15118)
					fireGlobals = jQuery.event && s.global;

					// Watch for a new set of requests
					if ( fireGlobals && jQuery.active++ === 0 ) {
						jQuery.event.trigger( "ajaxStart" );
					}

					// Uppercase the type
					s.type = s.type.toUpperCase();

					// Determine if request has content
					s.hasContent = !rnoContent.test( s.type );

					// Save the URL in case we're toying with the If-Modified-Since
					// and/or If-None-Match header later on
					// Remove hash to simplify url manipulation
					cacheURL = s.url.replace( rhash, "" );

					// More options handling for requests with no content
					if ( !s.hasContent ) {

						// Remember the hash so we can put it back
						uncached = s.url.slice( cacheURL.length );

						// If data is available and should be processed, append data to url
						if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
							cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

							// trac-9682: remove data so that it's not used in an eventual retry
							delete s.data;
						}

						// Add or update anti-cache param if needed
						if ( s.cache === false ) {
							cacheURL = cacheURL.replace( rantiCache, "$1" );
							uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce.guid++ ) +
								uncached;
						}

						// Put hash and anti-cache on the URL that will be requested (gh-1732)
						s.url = cacheURL + uncached;

					// Change '%20' to '+' if this is encoded form body content (gh-2658)
					} else if ( s.data && s.processData &&
						( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
						s.data = s.data.replace( r20, "+" );
					}

					// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
					if ( s.ifModified ) {
						if ( jQuery.lastModified[ cacheURL ] ) {
							jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
						}
						if ( jQuery.etag[ cacheURL ] ) {
							jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
						}
					}

					// Set the correct header, if data is being sent
					if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
						jqXHR.setRequestHeader( "Content-Type", s.contentType );
					}

					// Set the Accepts header for the server, depending on the dataType
					jqXHR.setRequestHeader(
						"Accept",
						s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
							s.accepts[ s.dataTypes[ 0 ] ] +
								( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
							s.accepts[ "*" ]
					);

					// Check for headers option
					for ( i in s.headers ) {
						jqXHR.setRequestHeader( i, s.headers[ i ] );
					}

					// Allow custom headers/mimetypes and early abort
					if ( s.beforeSend &&
						( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

						// Abort if not done already and return
						return jqXHR.abort();
					}

					// Aborting is no longer a cancellation
					strAbort = "abort";

					// Install callbacks on deferreds
					completeDeferred.add( s.complete );
					jqXHR.done( s.success );
					jqXHR.fail( s.error );

					// Get transport
					transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

					// If no transport, we auto-abort
					if ( !transport ) {
						done( -1, "No Transport" );
					} else {
						jqXHR.readyState = 1;

						// Send global event
						if ( fireGlobals ) {
							globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
						}

						// If request was aborted inside ajaxSend, stop there
						if ( completed ) {
							return jqXHR;
						}

						// Timeout
						if ( s.async && s.timeout > 0 ) {
							timeoutTimer = window.setTimeout( function() {
								jqXHR.abort( "timeout" );
							}, s.timeout );
						}

						try {
							completed = false;
							transport.send( requestHeaders, done );
						} catch ( e ) {

							// Rethrow post-completion exceptions
							if ( completed ) {
								throw e;
							}

							// Propagate others as results
							done( -1, e );
						}
					}

					// Callback for when everything is done
					function done( status, nativeStatusText, responses, headers ) {
						var isSuccess, success, error, response, modified,
							statusText = nativeStatusText;

						// Ignore repeat invocations
						if ( completed ) {
							return;
						}

						completed = true;

						// Clear timeout if it exists
						if ( timeoutTimer ) {
							window.clearTimeout( timeoutTimer );
						}

						// Dereference transport for early garbage collection
						// (no matter how long the jqXHR object will be used)
						transport = undefined;

						// Cache response headers
						responseHeadersString = headers || "";

						// Set readyState
						jqXHR.readyState = status > 0 ? 4 : 0;

						// Determine if successful
						isSuccess = status >= 200 && status < 300 || status === 304;

						// Get response data
						if ( responses ) {
							response = ajaxHandleResponses( s, jqXHR, responses );
						}

						// Use a noop converter for missing script but not if jsonp
						if ( !isSuccess &&
							jQuery.inArray( "script", s.dataTypes ) > -1 &&
							jQuery.inArray( "json", s.dataTypes ) < 0 ) {
							s.converters[ "text script" ] = function() {};
						}

						// Convert no matter what (that way responseXXX fields are always set)
						response = ajaxConvert( s, response, jqXHR, isSuccess );

						// If successful, handle type chaining
						if ( isSuccess ) {

							// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
							if ( s.ifModified ) {
								modified = jqXHR.getResponseHeader( "Last-Modified" );
								if ( modified ) {
									jQuery.lastModified[ cacheURL ] = modified;
								}
								modified = jqXHR.getResponseHeader( "etag" );
								if ( modified ) {
									jQuery.etag[ cacheURL ] = modified;
								}
							}

							// if no content
							if ( status === 204 || s.type === "HEAD" ) {
								statusText = "nocontent";

							// if not modified
							} else if ( status === 304 ) {
								statusText = "notmodified";

							// If we have data, let's convert it
							} else {
								statusText = response.state;
								success = response.data;
								error = response.error;
								isSuccess = !error;
							}
						} else {

							// Extract error from statusText and normalize for non-aborts
							error = statusText;
							if ( status || !statusText ) {
								statusText = "error";
								if ( status < 0 ) {
									status = 0;
								}
							}
						}

						// Set data for the fake xhr object
						jqXHR.status = status;
						jqXHR.statusText = ( nativeStatusText || statusText ) + "";

						// Success/Error
						if ( isSuccess ) {
							deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
						} else {
							deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
						}

						// Status-dependent callbacks
						jqXHR.statusCode( statusCode );
						statusCode = undefined;

						if ( fireGlobals ) {
							globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
								[ jqXHR, s, isSuccess ? success : error ] );
						}

						// Complete
						completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

						if ( fireGlobals ) {
							globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

							// Handle the global AJAX counter
							if ( !( --jQuery.active ) ) {
								jQuery.event.trigger( "ajaxStop" );
							}
						}
					}

					return jqXHR;
				},

				getJSON: function( url, data, callback ) {
					return jQuery.get( url, data, callback, "json" );
				},

				getScript: function( url, callback ) {
					return jQuery.get( url, undefined, callback, "script" );
				}
			} );

			jQuery.each( [ "get", "post" ], function( _i, method ) {
				jQuery[ method ] = function( url, data, callback, type ) {

					// Shift arguments if data argument was omitted
					if ( isFunction( data ) ) {
						type = type || callback;
						callback = data;
						data = undefined;
					}

					// The url can be an options object (which then must have .url)
					return jQuery.ajax( jQuery.extend( {
						url: url,
						type: method,
						dataType: type,
						data: data,
						success: callback
					}, jQuery.isPlainObject( url ) && url ) );
				};
			} );

			jQuery.ajaxPrefilter( function( s ) {
				var i;
				for ( i in s.headers ) {
					if ( i.toLowerCase() === "content-type" ) {
						s.contentType = s.headers[ i ] || "";
					}
				}
			} );


			jQuery._evalUrl = function( url, options, doc ) {
				return jQuery.ajax( {
					url: url,

					// Make this explicit, since user can override this through ajaxSetup (trac-11264)
					type: "GET",
					dataType: "script",
					cache: true,
					async: false,
					global: false,

					// Only evaluate the response if it is successful (gh-4126)
					// dataFilter is not invoked for failure responses, so using it instead
					// of the default converter is kludgy but it works.
					converters: {
						"text script": function() {}
					},
					dataFilter: function( response ) {
						jQuery.globalEval( response, options, doc );
					}
				} );
			};


			jQuery.fn.extend( {
				wrapAll: function( html ) {
					var wrap;

					if ( this[ 0 ] ) {
						if ( isFunction( html ) ) {
							html = html.call( this[ 0 ] );
						}

						// The elements to wrap the target around
						wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

						if ( this[ 0 ].parentNode ) {
							wrap.insertBefore( this[ 0 ] );
						}

						wrap.map( function() {
							var elem = this;

							while ( elem.firstElementChild ) {
								elem = elem.firstElementChild;
							}

							return elem;
						} ).append( this );
					}

					return this;
				},

				wrapInner: function( html ) {
					if ( isFunction( html ) ) {
						return this.each( function( i ) {
							jQuery( this ).wrapInner( html.call( this, i ) );
						} );
					}

					return this.each( function() {
						var self = jQuery( this ),
							contents = self.contents();

						if ( contents.length ) {
							contents.wrapAll( html );

						} else {
							self.append( html );
						}
					} );
				},

				wrap: function( html ) {
					var htmlIsFunction = isFunction( html );

					return this.each( function( i ) {
						jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
					} );
				},

				unwrap: function( selector ) {
					this.parent( selector ).not( "body" ).each( function() {
						jQuery( this ).replaceWith( this.childNodes );
					} );
					return this;
				}
			} );


			jQuery.expr.pseudos.hidden = function( elem ) {
				return !jQuery.expr.pseudos.visible( elem );
			};
			jQuery.expr.pseudos.visible = function( elem ) {
				return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
			};




			jQuery.ajaxSettings.xhr = function() {
				try {
					return new window.XMLHttpRequest();
				} catch ( e ) {}
			};

			var xhrSuccessStatus = {

					// File protocol always yields status code 0, assume 200
					0: 200,

					// Support: IE <=9 only
					// trac-1450: sometimes IE returns 1223 when it should be 204
					1223: 204
				},
				xhrSupported = jQuery.ajaxSettings.xhr();

			support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
			support.ajax = xhrSupported = !!xhrSupported;

			jQuery.ajaxTransport( function( options ) {
				var callback, errorCallback;

				// Cross domain only allowed if supported through XMLHttpRequest
				if ( support.cors || xhrSupported && !options.crossDomain ) {
					return {
						send: function( headers, complete ) {
							var i,
								xhr = options.xhr();

							xhr.open(
								options.type,
								options.url,
								options.async,
								options.username,
								options.password
							);

							// Apply custom fields if provided
							if ( options.xhrFields ) {
								for ( i in options.xhrFields ) {
									xhr[ i ] = options.xhrFields[ i ];
								}
							}

							// Override mime type if needed
							if ( options.mimeType && xhr.overrideMimeType ) {
								xhr.overrideMimeType( options.mimeType );
							}

							// X-Requested-With header
							// For cross-domain requests, seeing as conditions for a preflight are
							// akin to a jigsaw puzzle, we simply never set it to be sure.
							// (it can always be set on a per-request basis or even using ajaxSetup)
							// For same-domain requests, won't change header if already provided.
							if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
								headers[ "X-Requested-With" ] = "XMLHttpRequest";
							}

							// Set headers
							for ( i in headers ) {
								xhr.setRequestHeader( i, headers[ i ] );
							}

							// Callback
							callback = function( type ) {
								return function() {
									if ( callback ) {
										callback = errorCallback = xhr.onload =
											xhr.onerror = xhr.onabort = xhr.ontimeout =
												xhr.onreadystatechange = null;

										if ( type === "abort" ) {
											xhr.abort();
										} else if ( type === "error" ) {

											// Support: IE <=9 only
											// On a manual native abort, IE9 throws
											// errors on any property access that is not readyState
											if ( typeof xhr.status !== "number" ) {
												complete( 0, "error" );
											} else {
												complete(

													// File: protocol always yields status 0; see trac-8605, trac-14207
													xhr.status,
													xhr.statusText
												);
											}
										} else {
											complete(
												xhrSuccessStatus[ xhr.status ] || xhr.status,
												xhr.statusText,

												// Support: IE <=9 only
												// IE9 has no XHR2 but throws on binary (trac-11426)
												// For XHR2 non-text, let the caller handle it (gh-2498)
												( xhr.responseType || "text" ) !== "text"  ||
												typeof xhr.responseText !== "string" ?
													{ binary: xhr.response } :
													{ text: xhr.responseText },
												xhr.getAllResponseHeaders()
											);
										}
									}
								};
							};

							// Listen to events
							xhr.onload = callback();
							errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

							// Support: IE 9 only
							// Use onreadystatechange to replace onabort
							// to handle uncaught aborts
							if ( xhr.onabort !== undefined ) {
								xhr.onabort = errorCallback;
							} else {
								xhr.onreadystatechange = function() {

									// Check readyState before timeout as it changes
									if ( xhr.readyState === 4 ) {

										// Allow onerror to be called first,
										// but that will not handle a native abort
										// Also, save errorCallback to a variable
										// as xhr.onerror cannot be accessed
										window.setTimeout( function() {
											if ( callback ) {
												errorCallback();
											}
										} );
									}
								};
							}

							// Create the abort callback
							callback = callback( "abort" );

							try {

								// Do send the request (this may raise an exception)
								xhr.send( options.hasContent && options.data || null );
							} catch ( e ) {

								// trac-14683: Only rethrow if this hasn't been notified as an error yet
								if ( callback ) {
									throw e;
								}
							}
						},

						abort: function() {
							if ( callback ) {
								callback();
							}
						}
					};
				}
			} );




			// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
			jQuery.ajaxPrefilter( function( s ) {
				if ( s.crossDomain ) {
					s.contents.script = false;
				}
			} );

			// Install script dataType
			jQuery.ajaxSetup( {
				accepts: {
					script: "text/javascript, application/javascript, " +
						"application/ecmascript, application/x-ecmascript"
				},
				contents: {
					script: /\b(?:java|ecma)script\b/
				},
				converters: {
					"text script": function( text ) {
						jQuery.globalEval( text );
						return text;
					}
				}
			} );

			// Handle cache's special case and crossDomain
			jQuery.ajaxPrefilter( "script", function( s ) {
				if ( s.cache === undefined ) {
					s.cache = false;
				}
				if ( s.crossDomain ) {
					s.type = "GET";
				}
			} );

			// Bind script tag hack transport
			jQuery.ajaxTransport( "script", function( s ) {

				// This transport only deals with cross domain or forced-by-attrs requests
				if ( s.crossDomain || s.scriptAttrs ) {
					var script, callback;
					return {
						send: function( _, complete ) {
							script = jQuery( "<script>" )
								.attr( s.scriptAttrs || {} )
								.prop( { charset: s.scriptCharset, src: s.url } )
								.on( "load error", callback = function( evt ) {
									script.remove();
									callback = null;
									if ( evt ) {
										complete( evt.type === "error" ? 404 : 200, evt.type );
									}
								} );

							// Use native DOM manipulation to avoid our domManip AJAX trickery
							document.head.appendChild( script[ 0 ] );
						},
						abort: function() {
							if ( callback ) {
								callback();
							}
						}
					};
				}
			} );




			var oldCallbacks = [],
				rjsonp = /(=)\?(?=&|$)|\?\?/;

			// Default jsonp settings
			jQuery.ajaxSetup( {
				jsonp: "callback",
				jsonpCallback: function() {
					var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce.guid++ ) );
					this[ callback ] = true;
					return callback;
				}
			} );

			// Detect, normalize options and install callbacks for jsonp requests
			jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

				var callbackName, overwritten, responseContainer,
					jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
						"url" :
						typeof s.data === "string" &&
							( s.contentType || "" )
								.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
							rjsonp.test( s.data ) && "data"
					);

				// Handle iff the expected data type is "jsonp" or we have a parameter to set
				if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

					// Get callback name, remembering preexisting value associated with it
					callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
						s.jsonpCallback() :
						s.jsonpCallback;

					// Insert callback into url or form data
					if ( jsonProp ) {
						s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
					} else if ( s.jsonp !== false ) {
						s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
					}

					// Use data converter to retrieve json after script execution
					s.converters[ "script json" ] = function() {
						if ( !responseContainer ) {
							jQuery.error( callbackName + " was not called" );
						}
						return responseContainer[ 0 ];
					};

					// Force json dataType
					s.dataTypes[ 0 ] = "json";

					// Install callback
					overwritten = window[ callbackName ];
					window[ callbackName ] = function() {
						responseContainer = arguments;
					};

					// Clean-up function (fires after converters)
					jqXHR.always( function() {

						// If previous value didn't exist - remove it
						if ( overwritten === undefined ) {
							jQuery( window ).removeProp( callbackName );

						// Otherwise restore preexisting value
						} else {
							window[ callbackName ] = overwritten;
						}

						// Save back as free
						if ( s[ callbackName ] ) {

							// Make sure that re-using the options doesn't screw things around
							s.jsonpCallback = originalSettings.jsonpCallback;

							// Save the callback name for future use
							oldCallbacks.push( callbackName );
						}

						// Call if it was a function and we have a response
						if ( responseContainer && isFunction( overwritten ) ) {
							overwritten( responseContainer[ 0 ] );
						}

						responseContainer = overwritten = undefined;
					} );

					// Delegate to script
					return "script";
				}
			} );




			// Support: Safari 8 only
			// In Safari 8 documents created via document.implementation.createHTMLDocument
			// collapse sibling forms: the second one becomes a child of the first one.
			// Because of that, this security measure has to be disabled in Safari 8.
			// https://bugs.webkit.org/show_bug.cgi?id=137337
			support.createHTMLDocument = ( function() {
				var body = document.implementation.createHTMLDocument( "" ).body;
				body.innerHTML = "<form></form><form></form>";
				return body.childNodes.length === 2;
			} )();


			// Argument "data" should be string of html
			// context (optional): If specified, the fragment will be created in this context,
			// defaults to document
			// keepScripts (optional): If true, will include scripts passed in the html string
			jQuery.parseHTML = function( data, context, keepScripts ) {
				if ( typeof data !== "string" ) {
					return [];
				}
				if ( typeof context === "boolean" ) {
					keepScripts = context;
					context = false;
				}

				var base, parsed, scripts;

				if ( !context ) {

					// Stop scripts or inline event handlers from being executed immediately
					// by using document.implementation
					if ( support.createHTMLDocument ) {
						context = document.implementation.createHTMLDocument( "" );

						// Set the base href for the created document
						// so any parsed elements with URLs
						// are based on the document's URL (gh-2965)
						base = context.createElement( "base" );
						base.href = document.location.href;
						context.head.appendChild( base );
					} else {
						context = document;
					}
				}

				parsed = rsingleTag.exec( data );
				scripts = !keepScripts && [];

				// Single tag
				if ( parsed ) {
					return [ context.createElement( parsed[ 1 ] ) ];
				}

				parsed = buildFragment( [ data ], context, scripts );

				if ( scripts && scripts.length ) {
					jQuery( scripts ).remove();
				}

				return jQuery.merge( [], parsed.childNodes );
			};


			/**
			 * Load a url into a page
			 */
			jQuery.fn.load = function( url, params, callback ) {
				var selector, type, response,
					self = this,
					off = url.indexOf( " " );

				if ( off > -1 ) {
					selector = stripAndCollapse( url.slice( off ) );
					url = url.slice( 0, off );
				}

				// If it's a function
				if ( isFunction( params ) ) {

					// We assume that it's the callback
					callback = params;
					params = undefined;

				// Otherwise, build a param string
				} else if ( params && typeof params === "object" ) {
					type = "POST";
				}

				// If we have elements to modify, make the request
				if ( self.length > 0 ) {
					jQuery.ajax( {
						url: url,

						// If "type" variable is undefined, then "GET" method will be used.
						// Make value of this field explicit since
						// user can override it through ajaxSetup method
						type: type || "GET",
						dataType: "html",
						data: params
					} ).done( function( responseText ) {

						// Save response for use in complete callback
						response = arguments;

						self.html( selector ?

							// If a selector was specified, locate the right elements in a dummy div
							// Exclude scripts to avoid IE 'Permission Denied' errors
							jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

							// Otherwise use the full result
							responseText );

					// If the request succeeds, this function gets "data", "status", "jqXHR"
					// but they are ignored because response was set above.
					// If it fails, this function gets "jqXHR", "status", "error"
					} ).always( callback && function( jqXHR, status ) {
						self.each( function() {
							callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
						} );
					} );
				}

				return this;
			};




			jQuery.expr.pseudos.animated = function( elem ) {
				return jQuery.grep( jQuery.timers, function( fn ) {
					return elem === fn.elem;
				} ).length;
			};




			jQuery.offset = {
				setOffset: function( elem, options, i ) {
					var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
						position = jQuery.css( elem, "position" ),
						curElem = jQuery( elem ),
						props = {};

					// Set position first, in-case top/left are set even on static elem
					if ( position === "static" ) {
						elem.style.position = "relative";
					}

					curOffset = curElem.offset();
					curCSSTop = jQuery.css( elem, "top" );
					curCSSLeft = jQuery.css( elem, "left" );
					calculatePosition = ( position === "absolute" || position === "fixed" ) &&
						( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

					// Need to be able to calculate position if either
					// top or left is auto and position is either absolute or fixed
					if ( calculatePosition ) {
						curPosition = curElem.position();
						curTop = curPosition.top;
						curLeft = curPosition.left;

					} else {
						curTop = parseFloat( curCSSTop ) || 0;
						curLeft = parseFloat( curCSSLeft ) || 0;
					}

					if ( isFunction( options ) ) {

						// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
						options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
					}

					if ( options.top != null ) {
						props.top = ( options.top - curOffset.top ) + curTop;
					}
					if ( options.left != null ) {
						props.left = ( options.left - curOffset.left ) + curLeft;
					}

					if ( "using" in options ) {
						options.using.call( elem, props );

					} else {
						curElem.css( props );
					}
				}
			};

			jQuery.fn.extend( {

				// offset() relates an element's border box to the document origin
				offset: function( options ) {

					// Preserve chaining for setter
					if ( arguments.length ) {
						return options === undefined ?
							this :
							this.each( function( i ) {
								jQuery.offset.setOffset( this, options, i );
							} );
					}

					var rect, win,
						elem = this[ 0 ];

					if ( !elem ) {
						return;
					}

					// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
					// Support: IE <=11 only
					// Running getBoundingClientRect on a
					// disconnected node in IE throws an error
					if ( !elem.getClientRects().length ) {
						return { top: 0, left: 0 };
					}

					// Get document-relative position by adding viewport scroll to viewport-relative gBCR
					rect = elem.getBoundingClientRect();
					win = elem.ownerDocument.defaultView;
					return {
						top: rect.top + win.pageYOffset,
						left: rect.left + win.pageXOffset
					};
				},

				// position() relates an element's margin box to its offset parent's padding box
				// This corresponds to the behavior of CSS absolute positioning
				position: function() {
					if ( !this[ 0 ] ) {
						return;
					}

					var offsetParent, offset, doc,
						elem = this[ 0 ],
						parentOffset = { top: 0, left: 0 };

					// position:fixed elements are offset from the viewport, which itself always has zero offset
					if ( jQuery.css( elem, "position" ) === "fixed" ) {

						// Assume position:fixed implies availability of getBoundingClientRect
						offset = elem.getBoundingClientRect();

					} else {
						offset = this.offset();

						// Account for the *real* offset parent, which can be the document or its root element
						// when a statically positioned element is identified
						doc = elem.ownerDocument;
						offsetParent = elem.offsetParent || doc.documentElement;
						while ( offsetParent &&
							( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
							jQuery.css( offsetParent, "position" ) === "static" ) {

							offsetParent = offsetParent.parentNode;
						}
						if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

							// Incorporate borders into its offset, since they are outside its content origin
							parentOffset = jQuery( offsetParent ).offset();
							parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
							parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
						}
					}

					// Subtract parent offsets and element margins
					return {
						top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
						left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
					};
				},

				// This method will return documentElement in the following cases:
				// 1) For the element inside the iframe without offsetParent, this method will return
				//    documentElement of the parent window
				// 2) For the hidden or detached element
				// 3) For body or html element, i.e. in case of the html node - it will return itself
				//
				// but those exceptions were never presented as a real life use-cases
				// and might be considered as more preferable results.
				//
				// This logic, however, is not guaranteed and can change at any point in the future
				offsetParent: function() {
					return this.map( function() {
						var offsetParent = this.offsetParent;

						while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
							offsetParent = offsetParent.offsetParent;
						}

						return offsetParent || documentElement;
					} );
				}
			} );

			// Create scrollLeft and scrollTop methods
			jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
				var top = "pageYOffset" === prop;

				jQuery.fn[ method ] = function( val ) {
					return access( this, function( elem, method, val ) {

						// Coalesce documents and windows
						var win;
						if ( isWindow( elem ) ) {
							win = elem;
						} else if ( elem.nodeType === 9 ) {
							win = elem.defaultView;
						}

						if ( val === undefined ) {
							return win ? win[ prop ] : elem[ method ];
						}

						if ( win ) {
							win.scrollTo(
								!top ? val : win.pageXOffset,
								top ? val : win.pageYOffset
							);

						} else {
							elem[ method ] = val;
						}
					}, method, val, arguments.length );
				};
			} );

			// Support: Safari <=7 - 9.1, Chrome <=37 - 49
			// Add the top/left cssHooks using jQuery.fn.position
			// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
			// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
			// getComputedStyle returns percent when specified for top/left/bottom/right;
			// rather than make the css module depend on the offset module, just check for it here
			jQuery.each( [ "top", "left" ], function( _i, prop ) {
				jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
					function( elem, computed ) {
						if ( computed ) {
							computed = curCSS( elem, prop );

							// If curCSS returns percentage, fallback to offset
							return rnumnonpx.test( computed ) ?
								jQuery( elem ).position()[ prop ] + "px" :
								computed;
						}
					}
				);
			} );


			// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
			jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
				jQuery.each( {
					padding: "inner" + name,
					content: type,
					"": "outer" + name
				}, function( defaultExtra, funcName ) {

					// Margin is only for outerHeight, outerWidth
					jQuery.fn[ funcName ] = function( margin, value ) {
						var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
							extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

						return access( this, function( elem, type, value ) {
							var doc;

							if ( isWindow( elem ) ) {

								// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
								return funcName.indexOf( "outer" ) === 0 ?
									elem[ "inner" + name ] :
									elem.document.documentElement[ "client" + name ];
							}

							// Get document width or height
							if ( elem.nodeType === 9 ) {
								doc = elem.documentElement;

								// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
								// whichever is greatest
								return Math.max(
									elem.body[ "scroll" + name ], doc[ "scroll" + name ],
									elem.body[ "offset" + name ], doc[ "offset" + name ],
									doc[ "client" + name ]
								);
							}

							return value === undefined ?

								// Get width or height on the element, requesting but not forcing parseFloat
								jQuery.css( elem, type, extra ) :

								// Set width or height on the element
								jQuery.style( elem, type, value, extra );
						}, type, chainable ? margin : undefined, chainable );
					};
				} );
			} );


			jQuery.each( [
				"ajaxStart",
				"ajaxStop",
				"ajaxComplete",
				"ajaxError",
				"ajaxSuccess",
				"ajaxSend"
			], function( _i, type ) {
				jQuery.fn[ type ] = function( fn ) {
					return this.on( type, fn );
				};
			} );




			jQuery.fn.extend( {

				bind: function( types, data, fn ) {
					return this.on( types, null, data, fn );
				},
				unbind: function( types, fn ) {
					return this.off( types, null, fn );
				},

				delegate: function( selector, types, data, fn ) {
					return this.on( types, selector, data, fn );
				},
				undelegate: function( selector, types, fn ) {

					// ( namespace ) or ( selector, types [, fn] )
					return arguments.length === 1 ?
						this.off( selector, "**" ) :
						this.off( types, selector || "**", fn );
				},

				hover: function( fnOver, fnOut ) {
					return this
						.on( "mouseenter", fnOver )
						.on( "mouseleave", fnOut || fnOver );
				}
			} );

			jQuery.each(
				( "blur focus focusin focusout resize scroll click dblclick " +
				"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
				"change select submit keydown keypress keyup contextmenu" ).split( " " ),
				function( _i, name ) {

					// Handle event binding
					jQuery.fn[ name ] = function( data, fn ) {
						return arguments.length > 0 ?
							this.on( name, null, data, fn ) :
							this.trigger( name );
					};
				}
			);




			// Support: Android <=4.0 only
			// Make sure we trim BOM and NBSP
			// Require that the "whitespace run" starts from a non-whitespace
			// to avoid O(N^2) behavior when the engine would try matching "\s+$" at each space position.
			var rtrim = /^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;

			// Bind a function to a context, optionally partially applying any
			// arguments.
			// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
			// However, it is not slated for removal any time soon
			jQuery.proxy = function( fn, context ) {
				var tmp, args, proxy;

				if ( typeof context === "string" ) {
					tmp = fn[ context ];
					context = fn;
					fn = tmp;
				}

				// Quick check to determine if target is callable, in the spec
				// this throws a TypeError, but we will just return undefined.
				if ( !isFunction( fn ) ) {
					return undefined;
				}

				// Simulated bind
				args = slice.call( arguments, 2 );
				proxy = function() {
					return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
				};

				// Set the guid of unique handler to the same of original handler, so it can be removed
				proxy.guid = fn.guid = fn.guid || jQuery.guid++;

				return proxy;
			};

			jQuery.holdReady = function( hold ) {
				if ( hold ) {
					jQuery.readyWait++;
				} else {
					jQuery.ready( true );
				}
			};
			jQuery.isArray = Array.isArray;
			jQuery.parseJSON = JSON.parse;
			jQuery.nodeName = nodeName;
			jQuery.isFunction = isFunction;
			jQuery.isWindow = isWindow;
			jQuery.camelCase = camelCase;
			jQuery.type = toType;

			jQuery.now = Date.now;

			jQuery.isNumeric = function( obj ) {

				// As of jQuery 3.0, isNumeric is limited to
				// strings and numbers (primitives or objects)
				// that can be coerced to finite numbers (gh-2662)
				var type = jQuery.type( obj );
				return ( type === "number" || type === "string" ) &&

					// parseFloat NaNs numeric-cast false positives ("")
					// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
					// subtraction forces infinities to NaN
					!isNaN( obj - parseFloat( obj ) );
			};

			jQuery.trim = function( text ) {
				return text == null ?
					"" :
					( text + "" ).replace( rtrim, "$1" );
			};




			var

				// Map over jQuery in case of overwrite
				_jQuery = window.jQuery,

				// Map over the $ in case of overwrite
				_$ = window.$;

			jQuery.noConflict = function( deep ) {
				if ( window.$ === jQuery ) {
					window.$ = _$;
				}

				if ( deep && window.jQuery === jQuery ) {
					window.jQuery = _jQuery;
				}

				return jQuery;
			};

			// Expose jQuery and $ identifiers, even in AMD
			// (trac-7102#comment:10, https://github.com/jquery/jquery/pull/557)
			// and CommonJS for browser emulators (trac-13566)
			if ( typeof noGlobal === "undefined" ) {
				window.jQuery = window.$ = jQuery;
			}




			return jQuery;
			} ); 
		} (jquery$1));
		return jquery$1.exports;
	}

	var jqueryExports = requireJquery();
	var jQuery = /*@__PURE__*/getDefaultExportFromCjs(jqueryExports);

	/**
	 * @typedef {{
	 *   before?: HTMLElement,
	 *   after?: HTMLElement,
	 *   favicon?: boolean,
	 *   image?: boolean,
	 *   canvas?: boolean,
	 * }} Options
	 */

	/**
	 * @typedef {string|
	 *   (string|[stylesheetURL: string, options: Options])[]} Stylesheets
	 */
	/**
	 * @param {Stylesheets} stylesheets
	 * @param {{
	 *   before?: HTMLElement,
	 *   after?: HTMLElement,
	 *   favicon?: boolean,
	 *   image?: boolean,
	 *   canvas?: boolean,
	 *   acceptErrors?: boolean|((info: {
	 *     error: ErrorEvent,
	 *     stylesheetURL: string,
	 *     options: {},
	 *     resolve: (value: any) => void,
	 *     reject: (reason?: any) => void
	 *   }) => (reason?: any) => void)
	 * }} cfg
	 * @returns {Promise<HTMLLinkElement[]>}
	 */
	function loadStylesheets (stylesheets, {
	  before: beforeDefault, after: afterDefault, favicon: faviconDefault,
	  canvas: canvasDefault, image: imageDefault = true,
	  acceptErrors
	} = {}) {
	  stylesheets = Array.isArray(stylesheets) ? stylesheets : [stylesheets];

	  /**
	   * @param {string|[stylesheetURL: string, options: Options]} stylesheetURLInfo
	   * @returns {Promise<HTMLLinkElement>}
	   */
	  function setupLink (stylesheetURLInfo) {
	    /** @type {Options} */
	    let options = {};

	    /** @type {string} */
	    let stylesheetURL;
	    if (Array.isArray(stylesheetURLInfo)) {
	      ([stylesheetURL, options = {}] = stylesheetURLInfo);
	    } else {
	      stylesheetURL = stylesheetURLInfo;
	    }
	    let {favicon = faviconDefault} = options;
	    const {
	      before = beforeDefault,
	      after = afterDefault,
	      canvas = canvasDefault,
	      image = imageDefault
	    } = options;
	    function addLink () {
	      if (before) {
	        before.before(link);
	      } else if (after) {
	        after.after(link);
	      } else {
	        document.head.append(link);
	      }
	    }

	    const link = document.createElement('link');

	    // eslint-disable-next-line promise/avoid-new -- No native option
	    return new Promise((resolve, reject) => {
	      let rej = reject;
	      if (acceptErrors) {
	        rej = typeof acceptErrors === 'function'
	          ? (error) => {
	            acceptErrors({
	              error, stylesheetURL, options, resolve, reject
	            });
	          }
	          : resolve;
	      }
	      if (stylesheetURL.endsWith('.css')) {
	        favicon = false;
	      } else if (stylesheetURL.endsWith('.ico')) {
	        favicon = true;
	      }
	      if (favicon) {
	        link.rel = 'shortcut icon';
	        link.type = 'image/x-icon';

	        if (image === false) {
	          link.href = stylesheetURL;
	          addLink();
	          resolve(link);
	          return;
	        }

	        const cnv = document.createElement('canvas');
	        cnv.width = 16;
	        cnv.height = 16;
	        const context = cnv.getContext('2d');
	        const img = document.createElement('img');
	        // eslint-disable-next-line promise/prefer-await-to-callbacks -- No API
	        img.addEventListener('error', (error) => {
	          reject(error);
	        });
	        img.addEventListener('load', () => {
	          if (!context) {
	            throw new Error('Canvas context could not be found');
	          }
	          context.drawImage(img, 0, 0);
	          link.href = canvas
	            ? cnv.toDataURL('image/x-icon')
	            : stylesheetURL;
	          addLink();
	          resolve(link);
	        });
	        img.src = stylesheetURL;
	        return;
	      }
	      link.rel = 'stylesheet';
	      link.type = 'text/css';
	      link.href = stylesheetURL;
	      addLink();
	      // eslint-disable-next-line promise/prefer-await-to-callbacks -- No API
	      link.addEventListener('error', (error) => {
	        rej(error);
	      });
	      link.addEventListener('load', () => {
	        resolve(link);
	      });
	    });
	  }

	  return Promise.all(
	    stylesheets.map((stylesheetURL) => setupLink(stylesheetURL))
	  );
	}

	/* eslint-disable no-unused-vars -- Convenient */
	/**
	 * MIT License.
	 *
	 * @copyright 2014 White Magic Software, Inc.
	 * @copyright 2018 Brett Zamir
	 */


	/**
	 * @typedef {{
	 *   delay: JQuery.Duration | string,
	 *   outsideClickBehavior: "reset"|"select-parent"|"none",
	 *   breadcrumbRoot: string,
	 *   breadcrumb: (this: HTMLElement, $columns?: JQuery<HTMLElement>) => void,
	 *   current: (li: JQuery<HTMLLIElement>, $columns: JQuery<HTMLElement>) => void,
	 *   preview: null|((li: JQuery<HTMLLIElement>, $columns: JQuery<HTMLElement>) => void),
	 *   onPreview: null|((
	 *     ev: JQuery.ClickEvent<HTMLUListElement, undefined, HTMLUListElement, HTMLUListElement>,
	 *     li: JQuery<HTMLUListElement>,
	 *     $columns: JQuery<HTMLElement>
	 *   ) => void),
	 *   animation: (li: JQuery<HTMLLIElement>, $columns: JQuery<HTMLElement>) => void,
	 *   reset: ($columns: JQuery<HTMLElement>) => void,
	 *   scroll?: ($column: JQuery<HTMLElement>|null, $columns: JQuery<HTMLElement>) => void
	 * }} Settings
	 */

	const defaultCSSURL = new URL('../miller-columns.css', (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)).href;

	/**
	 * @param {string} s
	 * @returns {string}
	 */
	function escapeRegex (s) {
	  return s.replaceAll(/[\-\[\]\{\}\(\)*+?.,\\^$\|#\s]/gv, String.raw`\$&`);
	}

	/**
	 * @param {jQuery} $
	 * @param {object} cfg
	 * @param {string} [cfg.namespace]
	 * @param {Exclude<import('load-stylesheets').Stylesheets, string>} [cfg.stylesheets]
	 * @returns {Promise<jQuery>}
	 */
	async function addMillerColumnPlugin ($, {namespace = 'miller', stylesheets = ['@default']} = {}) {
	  /** @type {Settings} */
	  let settings;
	  const columnSelector = `ul:not(.${namespace}-no-columns),ol:not(.${namespace}-no-columns)`;
	  const itemSelector = 'li';
	  if (stylesheets) {
	    await loadStylesheets(stylesheets.map((s) => {
	      return s === '@default' ? defaultCSSURL : s;
	    }));
	  }

	  /**
	   * Returns a list of the currently selected items.
	   * @returns {JQuery<HTMLElement>}
	   */
	  function chain () {
	    return $(`.${namespace}-column > .${namespace}-selected`);
	  }

	  /**
	   * Add the breadcrumb path using the chain of selected items.
	   * @param {JQuery<HTMLElement>} [$columns] - Optional columns element for root link
	   * @returns {void}
	   */
	  function breadcrumb ($columns) {
	    const $breadcrumb = $(`.${namespace}-breadcrumbs`).empty();

	    // Add root link if breadcrumbRoot option is set
	    if (settings.breadcrumbRoot) {
	      $(`<span class="${namespace}-breadcrumb ${namespace}-breadcrumb-root">`).
	        text(settings.breadcrumbRoot).
	        on('click', function () {
	          if ($columns) {
	            reset($columns);
	            scrollIntoView($columns);
	          }
	        }).appendTo($breadcrumb);
	    }

	    chain().each(function () {
	      const $crumb = $(this);
	      $(`<span class="${namespace}-breadcrumb">`).
	        text($crumb.text().trim()).
	        on('click', function () {
	          $crumb.trigger('click');
	        }).appendTo($breadcrumb);
	    });
	  }

	  /**
	   * Ensure the viewport shows the entire newly expanded item.
	   *
	   * @param {JQuery<HTMLElement>|null} $column
	   * @param {JQuery<HTMLElement>} $columns
	   * @returns {void}
	   */
	  function animation ($column, $columns) {
	    let width = 0;
	    ($column ? chain().not($column) : chain()).each(function () {
	      width += /** @type {number} */ ($(this).outerWidth(true));
	    });
	    $columns.stop().animate({
	      scrollLeft: width
	    }, settings.delay, function () {
	      // Why isn't this working when we instead use this `last` on the `animate` above?
	      const last = $columns.find(`.${namespace}-column:not(.${namespace}-collapse)`).last();
	      // last[0].scrollIntoView(); // Scrolls vertically also unfortunately
	      last[0].scrollLeft = width;
	      if (settings.scroll) {
	        settings.scroll.call(this, $column, $columns);
	      }
	    });
	  }

	  /**
	   * Convert nested lists into columns using breadth-first traversal.
	   *
	   * @param {JQuery<HTMLElement>} $columns
	   * @param {JQuery<HTMLElement>} [$startNode] - Optional starting node for partial unnesting
	   * @returns {void}
	   */
	  function unnest ($columns, $startNode) {
	    const queue = [];
	    let $node;

	    // Push the root unordered list item into the queue.
	    queue.push($startNode || $columns.children());

	    while (queue.length) {
	      $node = /** @type {JQuery<HTMLElement>} */ (queue.shift());

	      $node.children(itemSelector).each(function () {
	        const $this = $(this);
	        const $child = $this.children(columnSelector);
	        const $ancestor = $this.parent().parent();

	        // Retain item hierarchy (because it is lost after flattening).
	        // Only set ancestor if it's actually a list item and not already set
	        // eslint-disable-next-line eqeqeq, no-eq-null -- Check either without duplication
	        if ($ancestor.length && $ancestor.is(itemSelector) && ($this.data(`${namespace}-ancestor`) == null)) {
	          // Use addBack to reset all selection chains.
	          $(this).siblings().addBack().data(`${namespace}-ancestor`, $ancestor);
	        }

	        if ($child.length) {
	          queue.push($child);
	          $(this).data(`${namespace}-child`, $child).addClass(`${namespace}-parent`);
	        }

	        // Causes item siblings to have a flattened DOM lineage.
	        $(this).parent(columnSelector).appendTo($columns).addClass(`${namespace}-column`);
	      });
	    }
	  }

	  /**
	   * Hide columns (not the first).
	   * @returns {void}
	   */
	  function collapse () {
	    $(`.${namespace}-column:gt(0)`).addClass(`${namespace}-collapse`);
	  }

	  /**
	   * Returns the last selected item (i.e., the current cursor).
	   * @returns {JQuery<HTMLElement>}
	   */
	  function current () {
	    return chain().last();
	  }

	  /**
	   * @param {JQuery<HTMLElement>} $columns
	   * @returns {void}
	   */
	  function scrollIntoView ($columns) {
	    animation(null, $columns);
	  }

	  /**
	   * @param {JQuery<HTMLElement>} $columns
	   * @returns {void}
	   */
	  function userReset ($columns) {
	    reset($columns);
	    scrollIntoView($columns);
	  }

	  /**
	   * Hide columns (not the first), remove selections, update breadcrumb.
	   *
	   * @param {JQuery<HTMLElement>} $columns
	   * @returns {void}
	   */
	  function reset ($columns) {
	    collapse();
	    chain().removeClass(`${namespace}-selected`);
	    breadcrumb($columns);

	    // Upon reset ensure no value is returned to the calling code.
	    settings.reset($columns);
	    if (settings.preview) {
	      $(`.${namespace}-preview`).remove();
	    }
	  }

	  /**
	   * Select item above current selection.
	   * @returns {void}
	   */
	  function moveU () {
	    const elem = current().prev();
	    elem[0]?.scrollIntoView({block: 'nearest'});
	    elem.trigger('click');
	  }

	  /**
	   * Select item below current selection.
	   * @returns {void}
	   */
	  function moveD () {
	    const elem = current().next();
	    elem[0]?.scrollIntoView({block: 'nearest', inline: 'start'});
	    elem.trigger('click');
	  }

	  /**
	   * Select item left of the current selection.
	   * @returns {void}
	   */
	  function moveL () {
	    const $current = current();
	    const $ancestor = $current.data(`${namespace}-ancestor`);
	    const $child = $current.data(`${namespace}-child`);

	    // If current item has children and they are visible, but we're at root level,
	    // do nothing - we're already on the parent and just expanded it
	    if ($child && !$child.hasClass(`${namespace}-collapse`) && !$ancestor) {
	      return;
	    }

	    // Move to ancestor if it exists
	    if ($ancestor) {
	      $ancestor[0]?.scrollIntoView({block: 'nearest'});
	      $ancestor.trigger('click');
	    }
	  }

	  /**
	   * Select item right of the current selection, or down if no right item.
	   * @returns {void}
	   */
	  function moveR () {
	    const $child = current().data(`${namespace}-child`);

	    if ($child) {
	      const elem = $child.children(itemSelector).first();
	      elem[0]?.scrollIntoView({block: 'nearest'});
	      elem.trigger('click');
	    } else {
	      moveD();
	    }
	  }

	  /**
	   * @callback MillerColumnsKeyPress
	   * @param {KeyboardEvent} e
	   * @returns {void}
	   */

	  /**
	   * @param {JQuery<HTMLElement>} $columns
	   * @returns {MillerColumnsKeyPress}
	   */
	  function getKeyPress ($columns) {
	    let buffer = '';
	    /** @type {number} */
	    let lastTime;

	    /**
	     * @param {string} key
	     * @returns {void}
	     */
	    function checkLastPressed (key) {
	      const currTime = Date.now();
	      if (!lastTime || currTime - lastTime < 500) {
	        buffer += key;
	      } else {
	        buffer = key;
	      }
	      lastTime = currTime;
	    }

	    return function keypress (ev) {
	      // eslint-disable-next-line prefer-destructuring -- TS
	      const key = /** @type {Event & {key: string}} */ (ev).key;
	      // Was an attempt made to move the currently selected item (the cursor)?
	      let moved = false;

	      switch (key) {
	      case 'Escape':
	        userReset($columns);
	        break;
	      case 'ArrowUp':
	        moveU();
	        moved = true;
	        break;
	      case 'ArrowDown':
	        moveD();
	        moved = true;
	        break;
	      case 'ArrowLeft':
	        moveL();
	        moved = true;
	        break;
	      case 'ArrowRight':
	        moveR();
	        moved = true;
	        break;
	      default:
	        if (!ev.metaKey && !ev.altKey) {
	          if (key.length === 1) {
	            checkLastPressed(key);
	            const matching = $columns.
	              find(`${itemSelector}.${namespace}-selected`).
	              last().
	              siblings().
	              filter(function () {
	                return new RegExp('^' + escapeRegex(buffer), 'iv').
	                  test($(this).text().trim());
	              });
	            const elem = matching.first();
	            elem[0]?.scrollIntoView({block: 'nearest'});
	            elem.trigger('click');
	          }
	          moved = true;
	        }
	        break;
	      }

	      // If no item is selected, then jump to the first item.
	      if (moved && (current().length === 0)) {
	        $(`.${namespace}-column`).first().children().first().trigger('click');
	      }

	      if (moved) {
	        ev.preventDefault();
	      }
	    };
	  }

	  /**
	   * @param {Partial<Settings>} options
	   */
	  $.fn.millerColumns = function (options) {
	    /** @type {Settings} */
	    const defaults = {
	      current ($item) { /* noop */ },
	      reset ($columns) { /* noop */ },
	      preview: null,
	      onPreview: null,
	      breadcrumbRoot: 'Root',
	      breadcrumb,
	      animation,
	      delay: 500,
	      outsideClickBehavior: 'select-parent'
	    };

	    settings = $.extend(defaults, options);

	    const $result = this.each(function () {
	      const $columns = $(this);

	      // Store original HTML for restoration
	      const originalHTML = $columns.html();
	      $columns.data(`${namespace}-original-html`, originalHTML);

	      unnest($columns);
	      collapse();
	      breadcrumb($columns); // Initialize breadcrumbs with Root link

	      // Store keypress handler for later removal
	      const keypressHandler = getKeyPress($columns);

	      // Expand the requested child node on click.
	      // Use event delegation to handle dynamically added items
	      $columns.on('click', itemSelector, function (ev) {
	        const $this = $(this);
	        reset($columns);

	        const $child = $this.data(`${namespace}-child`);
	        let $ancestor = $this;

	        if ($child) {
	          $child[0]?.scrollIntoView({block: 'nearest'});
	          $child.removeClass(`${namespace}-collapse`).
	            children().
	            removeClass(`${namespace}-selected`);
	        }

	        // Reveal all ancestors
	        while ($ancestor) {
	          $ancestor.
	            addClass(`${namespace}-selected`).
	            parent().
	            removeClass(`${namespace}-collapse`);
	          $ancestor = $ancestor.data(`${namespace}-ancestor`);
	        }

	        settings.animation.call(this, $this, $columns);
	        settings.breadcrumb.call(this, $columns);
	        settings.current.call(this, $this, $columns);

	        if (settings.preview) {
	          const isFinalCol = $this.hasClass(`${namespace}-selected`) &&
	            !$this.hasClass(`${namespace}-parent`);
	          if (isFinalCol) {
	            const content = settings.preview.call(this, $this, $columns);
	            const ul = /** @type {JQuery<HTMLUListElement>} */ (
	              $(`<ul class="${namespace}-column ${namespace}-preview">
                <li>${content}</li>
              </ul>`)
	            );
	            $this.parent().parent().append(ul);
	            ul[0].scrollIntoView({
	              block: 'nearest',
	              inline: 'start'
	            });
	            ul.on('click', (e) => {
	              e.stopPropagation();
	              settings.onPreview?.call(this, e, ul, $columns);
	            });
	          }
	        }

	        // Don't allow the underlying element
	        // to receive the click event.
	        ev.stopPropagation();
	      });

	      $columns[0].addEventListener('keydown', keypressHandler);

	      $columns.on('click', (e) => {
	        switch (settings.outsideClickBehavior) {
	        case 'reset':
	          userReset($columns);
	          break;
	        case 'select-parent': {
	          const caretPosition = document.caretPositionFromPoint(e.clientX, e.clientY);
	          const node = caretPosition?.offsetNode;
	          let elem = /** @type {Element|null} */ (node?.nodeType === 1 ? node : node?.parentElement);
	          while (elem) {
	            if (elem.matches(`ul.${namespace}-column:not(.${namespace}-collapse)`)) {
	              $(elem).prevAll(
	                `ul.${namespace}-column:not(.${namespace}-collapse)`
	              ).first().find(`li.${namespace}-selected`).trigger('click');
	              break;
	            }
	            elem = elem.parentElement;
	          }
	          break;
	        }
	        }
	      });

	      // Store handler reference for cleanup
	      $columns.data(`${namespace}-keypress-handler`, keypressHandler);

	      // The last set of columns on the page receives focus.
	      // $columns.focus();
	    });

	    /**
	     * Add a new item dynamically to the miller columns structure.
	     * The item can contain nested lists which will be automatically unnested.
	     *
	     * @param {string|JQuery<HTMLLIElement>} item - HTML string or jQuery element for the new list item
	     * @param {JQuery<HTMLLIElement>} [$parent] - Optional parent item to add this as a child.
	     *                                             If not provided, adds to root level.
	     * @returns {JQuery<HTMLLIElement>} The newly added item
	     */
	    $result.addItem = function (item, $parent) {
	      const $item = /** @type {JQuery<HTMLLIElement>} */ (typeof item === 'string' ? $(item) : item);
	      const $columns = $result;

	      if (!$parent) {
	        // Add to root level (first column)
	        const $rootColumn = $columns.find(`.${namespace}-column`).first();

	        if ($rootColumn.length) {
	          // Append to existing root column
	          $rootColumn.append($item);

	          // If the item has nested children, process them
	          const $child = $item.children(columnSelector);
	          if ($child.length) {
	            // Set up the parent-child relationship
	            $item.data(`${namespace}-child`, $child).addClass(`${namespace}-parent`);
	            // Process the child list to unnest it
	            unnest($columns, $child);
	          }
	        } else {
	          // No columns exist yet, create initial structure
	          const $tempWrapper = $('<ul>').append($item);
	          $columns.append($tempWrapper);
	          unnest($columns, $tempWrapper);
	        }
	      } else {
	        // Add as child of existing parent
	        let $childList = $parent.data(`${namespace}-child`);

	        if (!$childList) {
	          // Parent doesn't have children yet, create a new list with the item
	          $childList = $('<ul>').append($item);
	          $parent.append($childList);
	          $parent.data(`${namespace}-child`, $childList).addClass(`${namespace}-parent`);

	          // Set the ancestor relationship for the new item
	          $item.data(`${namespace}-ancestor`, $parent);

	          // The new list needs to be processed by unnest to become a column
	          unnest($columns, $childList);

	          // After unnesting, get the updated reference to the child list
	          $childList = $parent.data(`${namespace}-child`);
	        } else {
	          // Parent already has children - $childList is already a column
	          // Just append the new item directly to it
	          $childList.append($item);

	          // Set the ancestor relationship for the new item
	          $item.data(`${namespace}-ancestor`, $parent);
	        }

	        // If the new item has nested children, process them
	        const $child = $item.children(columnSelector);
	        if ($child.length) {
	          // Set up the parent-child relationship
	          $item.data(`${namespace}-child`, $child).addClass(`${namespace}-parent`);
	          // Process the child list to unnest it
	          unnest($columns, $child);
	        }
	      }

	      return $item;
	    };

	    /**
	     * Rebuild children for a parent item after external changes.
	     * @param {JQuery<HTMLLIElement>} $parent
	     * @param {(string|JQuery<HTMLLIElement>)[]} newItems
	     * @returns {JQuery<HTMLLIElement>}
	     */
	    $result.refreshChildren = function ($parent, newItems) {
	      if (!$parent || !$parent.length) {
	        return $parent;
	      }
	      const $existing = $parent.data(`${namespace}-child`);
	      if ($existing && $existing.length) {
	        $existing.remove();
	        $parent.removeData(`${namespace}-child`).removeClass(`${namespace}-parent`);
	      }
	      const $liItems = newItems.map((it) => (typeof it === 'string' ? $(it) : it));
	      const $newList = $('<ul>').append($liItems);
	      $parent.append($newList);
	      unnest($result, $newList);
	      $parent.trigger('click');
	      return $parent;
	    };

	    /**
	     * Destroy and restore original structure.
	     * @returns {JQuery<HTMLElement>}
	     */
	    $result.destroy = function () {
	      const $columns = $result;

	      $columns.each(function () {
	        const $col = $(this);
	        // Remove keydown event listener
	        const keypressHandler = $col.data(`${namespace}-keypress-handler`);
	        if (keypressHandler) {
	          this.removeEventListener('keydown', keypressHandler);
	        }

	        // Remove click event handlers
	        $col.off('click');

	        // Remove all miller-columns CSS classes from columns
	        $col.find(`.${namespace}-column`).removeClass(`${namespace}-column ${namespace}-collapse`);

	        // Remove all miller-parent classes and miller-selected classes
	        $col.find(`.${namespace}-parent`).removeClass(`${namespace}-parent`);
	        $col.find(`.${namespace}-selected`).removeClass(`${namespace}-selected`);

	        // Remove all data attributes
	        $col.find('li').each(function () {
	          const $item = $(this);
	          $item.removeData(`${namespace}-ancestor`);
	          $item.removeData(`${namespace}-child`);
	        });

	        // Remove preview columns
	        $col.find(`.${namespace}-preview`).remove();

	        // Restore original HTML structure
	        const originalHTML = $col.data(`${namespace}-original-html`);
	        if (originalHTML) {
	          $col.html(originalHTML);
	          $col.removeData(`${namespace}-original-html`);
	        }

	        $col.removeData(`${namespace}-keypress-handler`);
	      });

	      delete $result.addItem;
	      delete $result.destroy;
	      delete $result.refreshChildren;

	      return $result;
	    };

	    return $result;
	  };

	  return $;
	}

	/**
	 * filesize
	 *
	 * @copyright 2025 Jason Mulligan <jason.mulligan@avoidwork.com>
	 * @license BSD-3-Clause
	 * @version 11.0.13
	 */
	// Error Messages
	const INVALID_NUMBER = "Invalid number";
	const INVALID_ROUND = "Invalid rounding method";

	// Standard Types
	const IEC = "iec";
	const JEDEC = "jedec";
	const SI = "si";

	// Unit Types
	const BIT = "bit";
	const BITS = "bits";
	const BYTE = "byte";
	const BYTES = "bytes";
	const SI_KBIT = "kbit";
	const SI_KBYTE = "kB";

	// Output Format Types
	const ARRAY = "array";
	const FUNCTION = "function";
	const OBJECT = "object";
	const STRING = "string";

	// Processing Constants
	const EXPONENT = "exponent";
	const ROUND = "round";

	// Special Characters and Values
	const E = "e";
	const EMPTY = "";
	const PERIOD = ".";
	const S = "s";
	const SPACE = " ";
	const ZERO = "0";

	// Data Structures
	const STRINGS = {
		symbol: {
			iec: {
				bits: ["bit", "Kibit", "Mibit", "Gibit", "Tibit", "Pibit", "Eibit", "Zibit", "Yibit"],
				bytes: ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
			},
			jedec: {
				bits: ["bit", "Kbit", "Mbit", "Gbit", "Tbit", "Pbit", "Ebit", "Zbit", "Ybit"],
				bytes: ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
			}
		},
		fullform: {
			iec: ["", "kibi", "mebi", "gibi", "tebi", "pebi", "exbi", "zebi", "yobi"],
			jedec: ["", "kilo", "mega", "giga", "tera", "peta", "exa", "zetta", "yotta"]
		}
	};

	// Pre-computed lookup tables for performance optimization
	const BINARY_POWERS = [
		1, // 2^0
		1024, // 2^10
		1048576, // 2^20
		1073741824, // 2^30
		1099511627776, // 2^40
		1125899906842624, // 2^50
		1152921504606846976, // 2^60
		1180591620717411303424, // 2^70
		1208925819614629174706176 // 2^80
	];

	const DECIMAL_POWERS = [
		1, // 10^0
		1000, // 10^3
		1000000, // 10^6
		1000000000, // 10^9
		1000000000000, // 10^12
		1000000000000000, // 10^15
		1000000000000000000, // 10^18
		1000000000000000000000, // 10^21
		1000000000000000000000000 // 10^24
	];

	// Pre-computed log values for faster exponent calculation
	const LOG_2_1024 = Math.log(1024);
	const LOG_10_1000 = Math.log(1000);// Cached configuration lookup for better performance
	const STANDARD_CONFIGS = {
		[SI]: {isDecimal: true, ceil: 1000, actualStandard: JEDEC},
		[IEC]: {isDecimal: false, ceil: 1024, actualStandard: IEC},
		[JEDEC]: {isDecimal: false, ceil: 1024, actualStandard: JEDEC}
	};

	/**
	 * Optimized base configuration lookup
	 * @param {string} standard - Standard type
	 * @param {number} base - Base number
	 * @returns {Object} Configuration object
	 */
	function getBaseConfiguration (standard, base) {
		// Use cached lookup table for better performance
		if (STANDARD_CONFIGS[standard]) {
			return STANDARD_CONFIGS[standard];
		}

		// Base override
		if (base === 2) {
			return {isDecimal: false, ceil: 1024, actualStandard: IEC};
		}

		// Default
		return {isDecimal: true, ceil: 1000, actualStandard: JEDEC};
	}

	/**
	 * Optimized zero value handling
	 * @param {number} precision - Precision value
	 * @param {string} actualStandard - Standard to use
	 * @param {boolean} bits - Whether to use bits
	 * @param {Object} symbols - Custom symbols
	 * @param {boolean} full - Whether to use full form
	 * @param {Array} fullforms - Custom full forms
	 * @param {string} output - Output format
	 * @param {string} spacer - Spacer character
	 * @returns {string|Array|Object|number} Formatted result
	 */
	function handleZeroValue (precision, actualStandard, bits, symbols, full, fullforms, output, spacer) {
		const result = [];
		result[0] = precision > 0 ? (0).toPrecision(precision) : 0;
		const u = result[1] = STRINGS.symbol[actualStandard][bits ? BITS : BYTES][0];

		if (output === EXPONENT) {
			return 0;
		}

		// Apply symbol customization
		if (symbols[result[1]]) {
			result[1] = symbols[result[1]];
		}

		// Apply full form
		if (full) {
			result[1] = fullforms[0] || STRINGS.fullform[actualStandard][0] + (bits ? BIT : BYTE);
		}

		// Return in requested format
		return output === ARRAY ? result : output === OBJECT ? {
			value: result[0],
			symbol: result[1],
			exponent: 0,
			unit: u
		} : result.join(spacer);
	}

	/**
	 * Optimized value calculation with bits handling
	 * @param {number} num - Input number
	 * @param {number} e - Exponent
	 * @param {boolean} isDecimal - Whether to use decimal powers
	 * @param {boolean} bits - Whether to calculate bits
	 * @param {number} ceil - Ceiling value for auto-increment
	 * @returns {Object} Object with val and e properties
	 */
	function calculateOptimizedValue (num, e, isDecimal, bits, ceil) {
		const d = isDecimal ? DECIMAL_POWERS[e] : BINARY_POWERS[e];
		let result = num / d;

		if (bits) {
			result *= 8;
			// Handle auto-increment for bits
			if (result >= ceil && e < 8) {
				result /= ceil;
				e++;
			}
		}

		return {result, e};
	}

	/**
	 * Optimized precision handling with scientific notation correction
	 * @param {number} value - Current value
	 * @param {number} precision - Precision to apply
	 * @param {number} e - Current exponent
	 * @param {number} num - Original number
	 * @param {boolean} isDecimal - Whether using decimal base
	 * @param {boolean} bits - Whether calculating bits
	 * @param {number} ceil - Ceiling value
	 * @param {Function} roundingFunc - Rounding function
	 * @param {number} round - Round value
	 * @returns {Object} Object with value and e properties
	 */
	function applyPrecisionHandling (value, precision, e, num, isDecimal, bits, ceil, roundingFunc, round) {
		let result = value.toPrecision(precision);

		// Handle scientific notation by recalculating with incremented exponent
		if (result.includes(E) && e < 8) {
			e++;
			const {result: valueResult} = calculateOptimizedValue(num, e, isDecimal, bits, ceil);
			const p = round > 0 ? Math.pow(10, round) : 1;
			result = (p === 1 ? roundingFunc(valueResult) : roundingFunc(valueResult * p) / p).toPrecision(precision);
		}

		return {value: result, e};
	}

	/**
	 * Optimized number formatting with locale, separator, and padding
	 * @param {number|string} value - Value to format
	 * @param {string|boolean} locale - Locale setting
	 * @param {Object} localeOptions - Locale options
	 * @param {string} separator - Custom separator
	 * @param {boolean} pad - Whether to pad
	 * @param {number} round - Round value
	 * @returns {string|number} Formatted value
	 */
	function applyNumberFormatting (value, locale, localeOptions, separator, pad, round) {
		let result = value;

		// Apply locale formatting
		if (locale === true) {
			result = result.toLocaleString();
		} else if (locale.length > 0) {
			result = result.toLocaleString(locale, localeOptions);
		} else if (separator.length > 0) {
			result = result.toString().replace(PERIOD, separator);
		}

		// Apply padding
		if (pad && round > 0) {
			const resultStr = result.toString();
			const x = separator || ((resultStr.match(/(\D)/g) || []).pop() || PERIOD);
			const tmp = resultStr.split(x);
			const s = tmp[1] || EMPTY;
			const l = s.length;
			const n = round - l;

			result = `${tmp[0]}${x}${s.padEnd(l + n, ZERO)}`;
		}

		return result;
	}/**
	 * Converts a file size in bytes to a human-readable string with appropriate units
	 * @param {number|string|bigint} arg - The file size in bytes to convert
	 * @param {Object} [options={}] - Configuration options for formatting
	 * @param {boolean} [options.bits=false] - If true, calculates bits instead of bytes
	 * @param {boolean} [options.pad=false] - If true, pads decimal places to match round parameter
	 * @param {number} [options.base=-1] - Number base (2 for binary, 10 for decimal, -1 for auto)
	 * @param {number} [options.round=2] - Number of decimal places to round to
	 * @param {string|boolean} [options.locale=""] - Locale for number formatting, true for system locale
	 * @param {Object} [options.localeOptions={}] - Additional options for locale formatting
	 * @param {string} [options.separator=""] - Custom decimal separator
	 * @param {string} [options.spacer=" "] - String to separate value and unit
	 * @param {Object} [options.symbols={}] - Custom unit symbols
	 * @param {string} [options.standard=""] - Unit standard to use (SI, IEC, JEDEC)
	 * @param {string} [options.output="string"] - Output format: "string", "array", "object", or "exponent"
	 * @param {boolean} [options.fullform=false] - If true, uses full unit names instead of abbreviations
	 * @param {Array} [options.fullforms=[]] - Custom full unit names
	 * @param {number} [options.exponent=-1] - Force specific exponent (-1 for auto)
	 * @param {string} [options.roundingMethod="round"] - Math rounding method to use
	 * @param {number} [options.precision=0] - Number of significant digits (0 for auto)
	 * @returns {string|Array|Object|number} Formatted file size based on output option
	 * @throws {TypeError} When arg is not a valid number or roundingMethod is invalid
	 * @example
	 * filesize(1024) // "1 KB"
	 * filesize(1024, {bits: true}) // "8 Kb"
	 * filesize(1024, {output: "object"}) // {value: 1, symbol: "KB", exponent: 1, unit: "KB"}
	 */
	function filesize (arg, {
		bits = false,
		pad = false,
		base = -1,
		round = 2,
		locale = EMPTY,
		localeOptions = {},
		separator = EMPTY,
		spacer = SPACE,
		symbols = {},
		standard = EMPTY,
		output = STRING,
		fullform = false,
		fullforms = [],
		exponent = -1,
		roundingMethod = ROUND,
		precision = 0
	} = {}) {
		let e = exponent,
			num = Number(arg),
			result = [],
			val = 0,
			u = EMPTY;

		// Optimized base & standard configuration lookup
		const {isDecimal, ceil, actualStandard} = getBaseConfiguration(standard, base);

		const full = fullform === true,
			neg = num < 0,
			roundingFunc = Math[roundingMethod];

		if (typeof arg !== "bigint" && isNaN(arg)) {
			throw new TypeError(INVALID_NUMBER);
		}

		if (typeof roundingFunc !== FUNCTION) {
			throw new TypeError(INVALID_ROUND);
		}

		// Flipping a negative number to determine the size
		if (neg) {
			num = -num;
		}

		// Fast path for zero
		if (num === 0) {
			return handleZeroValue(precision, actualStandard, bits, symbols, full, fullforms, output, spacer);
		}

		// Optimized exponent calculation using pre-computed log values
		if (e === -1 || isNaN(e)) {
			e = isDecimal ? Math.floor(Math.log(num) / LOG_10_1000) : Math.floor(Math.log(num) / LOG_2_1024);
			if (e < 0) {
				e = 0;
			}
		}

		// Exceeding supported length, time to reduce & multiply
		if (e > 8) {
			if (precision > 0) {
				precision += 8 - e;
			}
			e = 8;
		}

		if (output === EXPONENT) {
			return e;
		}

		// Calculate value with optimized lookup and bits handling
		const {result: valueResult, e: valueExponent} = calculateOptimizedValue(num, e, isDecimal, bits, ceil);
		val = valueResult;
		e = valueExponent;

		// Optimize rounding calculation
		const p = e > 0 && round > 0 ? Math.pow(10, round) : 1;
		result[0] = p === 1 ? roundingFunc(val) : roundingFunc(val * p) / p;

		if (result[0] === ceil && e < 8 && exponent === -1) {
			result[0] = 1;
			e++;
		}

		// Apply precision handling
		if (precision > 0) {
			const precisionResult = applyPrecisionHandling(result[0], precision, e, num, isDecimal, bits, ceil, roundingFunc, round);
			result[0] = precisionResult.value;
			e = precisionResult.e;
		}

		// Cache symbol lookup
		const symbolTable = STRINGS.symbol[actualStandard][bits ? BITS : BYTES];
		u = result[1] = (isDecimal && e === 1) ? (bits ? SI_KBIT : SI_KBYTE) : symbolTable[e];

		// Decorating a 'diff'
		if (neg) {
			result[0] = -result[0];
		}

		// Applying custom symbol
		if (symbols[result[1]]) {
			result[1] = symbols[result[1]];
		}

		// Apply locale, separator, and padding formatting
		result[0] = applyNumberFormatting(result[0], locale, localeOptions, separator, pad, round);

		if (full) {
			result[1] = fullforms[e] || STRINGS.fullform[actualStandard][e] + (bits ? BIT : BYTE) + (result[0] === 1 ? EMPTY : S);
		}

		// Optimized return logic
		if (output === ARRAY) {
			return result;
		}

		if (output === OBJECT) {
			return {
				value: result[0],
				symbol: result[1],
				exponent: e,
				unit: u
			};
		}

		return spacer === SPACE ? `${result[0]} ${result[1]}` : result.join(spacer);
	}

	/* eslint-disable jsdoc/reject-any-type -- Generic */
	/**
	 * Split an array into chunks of a specified size.
	 * @param {any[]} arr
	 * @param {number} n
	 * @returns {any[][]}
	 */
	const chunk = (arr, n) => Array.from({
	  length: Math.ceil(arr.length / n)
	}, (_, i) => arr.slice(n * i, n + (n * i)));
	/* eslint-enable jsdoc/reject-any-type -- Generic */

	/**
	 * Query selector that returns a single element.
	 * @param {string} sel
	 * @returns {HTMLElement}
	 */
	const $ = (sel) => {
	  return /** @type {HTMLElement} */ (document.querySelector(sel));
	};

	/**
	 * Query selector that returns all matching elements.
	 * @param {string} sel
	 * @returns {HTMLElement[]}
	 */
	const $$ = (sel) => {
	  return /** @type {HTMLElement[]} */ ([...document.querySelectorAll(sel)]);
	};

	/**
	 * Get elements matching selector, but only from non-collapsed columns.
	 * In three-columns view, collapsed columns contain stale copies of elements.
	 *
	 * @param {string} sel
	 * @returns {HTMLElement[]}
	 */
	const $$active = (sel) => {
	  const elements = $$(sel);
	  return elements.filter((el) => {
	    const column = el.closest('.miller-column');
	    return !column || !column.classList.contains('miller-collapse');
	  });
	};

	// Get Node APIs from the preload script
	const {storage} = globalThis.electronAPI;

	// Use persistent storage instead of localStorage (synchronous via IPC)
	// eslint-disable-next-line no-shadow -- Intentionally shadowing global
	const localStorage = storage;

	var plist$1 = {};

	var parse = {};

	var lib$1 = {};

	var dom = {};

	var conventions = {};

	var hasRequiredConventions;

	function requireConventions () {
		if (hasRequiredConventions) return conventions;
		hasRequiredConventions = 1;

		/**
		 * Ponyfill for `Array.prototype.find` which is only available in ES6 runtimes.
		 *
		 * Works with anything that has a `length` property and index access properties, including NodeList.
		 *
		 * @template {unknown} T
		 * @param {Array<T> | ({length:number, [number]: T})} list
		 * @param {function (item: T, index: number, list:Array<T> | ({length:number, [number]: T})):boolean} predicate
		 * @param {Partial<Pick<ArrayConstructor['prototype'], 'find'>>?} ac `Array.prototype` by default,
		 * 				allows injecting a custom implementation in tests
		 * @returns {T | undefined}
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
		 * @see https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.find
		 */
		function find(list, predicate, ac) {
			if (ac === undefined) {
				ac = Array.prototype;
			}
			if (list && typeof ac.find === 'function') {
				return ac.find.call(list, predicate);
			}
			for (var i = 0; i < list.length; i++) {
				if (Object.prototype.hasOwnProperty.call(list, i)) {
					var item = list[i];
					if (predicate.call(undefined, item, i, list)) {
						return item;
					}
				}
			}
		}

		/**
		 * "Shallow freezes" an object to render it immutable.
		 * Uses `Object.freeze` if available,
		 * otherwise the immutability is only in the type.
		 *
		 * Is used to create "enum like" objects.
		 *
		 * @template T
		 * @param {T} object the object to freeze
		 * @param {Pick<ObjectConstructor, 'freeze'> = Object} oc `Object` by default,
		 * 				allows to inject custom object constructor for tests
		 * @returns {Readonly<T>}
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
		 */
		function freeze(object, oc) {
			if (oc === undefined) {
				oc = Object;
			}
			return oc && typeof oc.freeze === 'function' ? oc.freeze(object) : object
		}

		/**
		 * Since we can not rely on `Object.assign` we provide a simplified version
		 * that is sufficient for our needs.
		 *
		 * @param {Object} target
		 * @param {Object | null | undefined} source
		 *
		 * @returns {Object} target
		 * @throws TypeError if target is not an object
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
		 * @see https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.assign
		 */
		function assign(target, source) {
			if (target === null || typeof target !== 'object') {
				throw new TypeError('target is not an object')
			}
			for (var key in source) {
				if (Object.prototype.hasOwnProperty.call(source, key)) {
					target[key] = source[key];
				}
			}
			return target
		}

		/**
		 * All mime types that are allowed as input to `DOMParser.parseFromString`
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString#Argument02 MDN
		 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparsersupportedtype WHATWG HTML Spec
		 * @see DOMParser.prototype.parseFromString
		 */
		var MIME_TYPE = freeze({
			/**
			 * `text/html`, the only mime type that triggers treating an XML document as HTML.
			 *
			 * @see DOMParser.SupportedType.isHTML
			 * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
			 * @see https://en.wikipedia.org/wiki/HTML Wikipedia
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
			 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring WHATWG HTML Spec
			 */
			HTML: 'text/html',

			/**
			 * Helper method to check a mime type if it indicates an HTML document
			 *
			 * @param {string} [value]
			 * @returns {boolean}
			 *
			 * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
			 * @see https://en.wikipedia.org/wiki/HTML Wikipedia
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
			 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring 	 */
			isHTML: function (value) {
				return value === MIME_TYPE.HTML
			},

			/**
			 * `application/xml`, the standard mime type for XML documents.
			 *
			 * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType registration
			 * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
			 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
			 */
			XML_APPLICATION: 'application/xml',

			/**
			 * `text/html`, an alias for `application/xml`.
			 *
			 * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
			 * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
			 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
			 */
			XML_TEXT: 'text/xml',

			/**
			 * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
			 * but is parsed as an XML document.
			 *
			 * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType registration
			 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
			 * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
			 */
			XML_XHTML_APPLICATION: 'application/xhtml+xml',

			/**
			 * `image/svg+xml`,
			 *
			 * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
			 * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
			 * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
			 */
			XML_SVG_IMAGE: 'image/svg+xml',
		});

		/**
		 * Namespaces that are used in this code base.
		 *
		 * @see http://www.w3.org/TR/REC-xml-names
		 */
		var NAMESPACE = freeze({
			/**
			 * The XHTML namespace.
			 *
			 * @see http://www.w3.org/1999/xhtml
			 */
			HTML: 'http://www.w3.org/1999/xhtml',

			/**
			 * Checks if `uri` equals `NAMESPACE.HTML`.
			 *
			 * @param {string} [uri]
			 *
			 * @see NAMESPACE.HTML
			 */
			isHTML: function (uri) {
				return uri === NAMESPACE.HTML
			},

			/**
			 * The SVG namespace.
			 *
			 * @see http://www.w3.org/2000/svg
			 */
			SVG: 'http://www.w3.org/2000/svg',

			/**
			 * The `xml:` namespace.
			 *
			 * @see http://www.w3.org/XML/1998/namespace
			 */
			XML: 'http://www.w3.org/XML/1998/namespace',

			/**
			 * The `xmlns:` namespace
			 *
			 * @see https://www.w3.org/2000/xmlns/
			 */
			XMLNS: 'http://www.w3.org/2000/xmlns/',
		});

		conventions.assign = assign;
		conventions.find = find;
		conventions.freeze = freeze;
		conventions.MIME_TYPE = MIME_TYPE;
		conventions.NAMESPACE = NAMESPACE;
		return conventions;
	}

	var hasRequiredDom;

	function requireDom () {
		if (hasRequiredDom) return dom;
		hasRequiredDom = 1;
		var conventions = requireConventions();

		var find = conventions.find;
		var NAMESPACE = conventions.NAMESPACE;

		/**
		 * A prerequisite for `[].filter`, to drop elements that are empty
		 * @param {string} input
		 * @returns {boolean}
		 */
		function notEmptyString (input) {
			return input !== ''
		}
		/**
		 * @see https://infra.spec.whatwg.org/#split-on-ascii-whitespace
		 * @see https://infra.spec.whatwg.org/#ascii-whitespace
		 *
		 * @param {string} input
		 * @returns {string[]} (can be empty)
		 */
		function splitOnASCIIWhitespace(input) {
			// U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE
			return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : []
		}

		/**
		 * Adds element as a key to current if it is not already present.
		 *
		 * @param {Record<string, boolean | undefined>} current
		 * @param {string} element
		 * @returns {Record<string, boolean | undefined>}
		 */
		function orderedSetReducer (current, element) {
			if (!current.hasOwnProperty(element)) {
				current[element] = true;
			}
			return current;
		}

		/**
		 * @see https://infra.spec.whatwg.org/#ordered-set
		 * @param {string} input
		 * @returns {string[]}
		 */
		function toOrderedSet(input) {
			if (!input) return [];
			var list = splitOnASCIIWhitespace(input);
			return Object.keys(list.reduce(orderedSetReducer, {}))
		}

		/**
		 * Uses `list.indexOf` to implement something like `Array.prototype.includes`,
		 * which we can not rely on being available.
		 *
		 * @param {any[]} list
		 * @returns {function(any): boolean}
		 */
		function arrayIncludes (list) {
			return function(element) {
				return list && list.indexOf(element) !== -1;
			}
		}

		function copy(src,dest){
			for(var p in src){
				if (Object.prototype.hasOwnProperty.call(src, p)) {
					dest[p] = src[p];
				}
			}
		}

		/**
		^\w+\.prototype\.([_\w]+)\s*=\s*((?:.*\{\s*?[\r\n][\s\S]*?^})|\S.*?(?=[;\r\n]));?
		^\w+\.prototype\.([_\w]+)\s*=\s*(\S.*?(?=[;\r\n]));?
		 */
		function _extends(Class,Super){
			var pt = Class.prototype;
			if(!(pt instanceof Super)){
				function t(){}			t.prototype = Super.prototype;
				t = new t();
				copy(pt,t);
				Class.prototype = pt = t;
			}
			if(pt.constructor != Class){
				if(typeof Class != 'function'){
					console.error("unknown Class:"+Class);
				}
				pt.constructor = Class;
			}
		}

		// Node Types
		var NodeType = {};
		var ELEMENT_NODE                = NodeType.ELEMENT_NODE                = 1;
		var ATTRIBUTE_NODE              = NodeType.ATTRIBUTE_NODE              = 2;
		var TEXT_NODE                   = NodeType.TEXT_NODE                   = 3;
		var CDATA_SECTION_NODE          = NodeType.CDATA_SECTION_NODE          = 4;
		var ENTITY_REFERENCE_NODE       = NodeType.ENTITY_REFERENCE_NODE       = 5;
		var ENTITY_NODE                 = NodeType.ENTITY_NODE                 = 6;
		var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
		var COMMENT_NODE                = NodeType.COMMENT_NODE                = 8;
		var DOCUMENT_NODE               = NodeType.DOCUMENT_NODE               = 9;
		var DOCUMENT_TYPE_NODE          = NodeType.DOCUMENT_TYPE_NODE          = 10;
		var DOCUMENT_FRAGMENT_NODE      = NodeType.DOCUMENT_FRAGMENT_NODE      = 11;
		var NOTATION_NODE               = NodeType.NOTATION_NODE               = 12;

		// ExceptionCode
		var ExceptionCode = {};
		var ExceptionMessage = {};
		ExceptionCode.INDEX_SIZE_ERR              = ((ExceptionMessage[1]="Index size error"),1);
		ExceptionCode.DOMSTRING_SIZE_ERR          = ((ExceptionMessage[2]="DOMString size error"),2);
		var HIERARCHY_REQUEST_ERR       = ExceptionCode.HIERARCHY_REQUEST_ERR       = ((ExceptionMessage[3]="Hierarchy request error"),3);
		ExceptionCode.WRONG_DOCUMENT_ERR          = ((ExceptionMessage[4]="Wrong document"),4);
		ExceptionCode.INVALID_CHARACTER_ERR       = ((ExceptionMessage[5]="Invalid character"),5);
		ExceptionCode.NO_DATA_ALLOWED_ERR         = ((ExceptionMessage[6]="No data allowed"),6);
		ExceptionCode.NO_MODIFICATION_ALLOWED_ERR = ((ExceptionMessage[7]="No modification allowed"),7);
		var NOT_FOUND_ERR               = ExceptionCode.NOT_FOUND_ERR               = ((ExceptionMessage[8]="Not found"),8);
		ExceptionCode.NOT_SUPPORTED_ERR           = ((ExceptionMessage[9]="Not supported"),9);
		var INUSE_ATTRIBUTE_ERR         = ExceptionCode.INUSE_ATTRIBUTE_ERR         = ((ExceptionMessage[10]="Attribute in use"),10);
		//level2
		ExceptionCode.INVALID_STATE_ERR        	= ((ExceptionMessage[11]="Invalid state"),11);
		ExceptionCode.SYNTAX_ERR               	= ((ExceptionMessage[12]="Syntax error"),12);
		ExceptionCode.INVALID_MODIFICATION_ERR 	= ((ExceptionMessage[13]="Invalid modification"),13);
		ExceptionCode.NAMESPACE_ERR           	= ((ExceptionMessage[14]="Invalid namespace"),14);
		ExceptionCode.INVALID_ACCESS_ERR      	= ((ExceptionMessage[15]="Invalid access"),15);

		/**
		 * DOM Level 2
		 * Object DOMException
		 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/ecma-script-binding.html
		 * @see http://www.w3.org/TR/REC-DOM-Level-1/ecma-script-language-binding.html
		 */
		function DOMException(code, message) {
			if(message instanceof Error){
				var error = message;
			}else {
				error = this;
				Error.call(this, ExceptionMessage[code]);
				this.message = ExceptionMessage[code];
				if(Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
			}
			error.code = code;
			if(message) this.message = this.message + ": " + message;
			return error;
		}	DOMException.prototype = Error.prototype;
		copy(ExceptionCode,DOMException);

		/**
		 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-536297177
		 * The NodeList interface provides the abstraction of an ordered collection of nodes, without defining or constraining how this collection is implemented. NodeList objects in the DOM are live.
		 * The items in the NodeList are accessible via an integral index, starting from 0.
		 */
		function NodeList() {
		}	NodeList.prototype = {
			/**
			 * The number of nodes in the list. The range of valid child node indices is 0 to length-1 inclusive.
			 * @standard level1
			 */
			length:0,
			/**
			 * Returns the indexth item in the collection. If index is greater than or equal to the number of nodes in the list, this returns null.
			 * @standard level1
			 * @param index  unsigned long
			 *   Index into the collection.
			 * @return Node
			 * 	The node at the indexth position in the NodeList, or null if that is not a valid index.
			 */
			item: function(index) {
				return index >= 0 && index < this.length ? this[index] : null;
			},
			toString:function(isHTML,nodeFilter){
				for(var buf = [], i = 0;i<this.length;i++){
					serializeToString(this[i],buf,isHTML,nodeFilter);
				}
				return buf.join('');
			},
			/**
			 * @private
			 * @param {function (Node):boolean} predicate
			 * @returns {Node[]}
			 */
			filter: function (predicate) {
				return Array.prototype.filter.call(this, predicate);
			},
			/**
			 * @private
			 * @param {Node} item
			 * @returns {number}
			 */
			indexOf: function (item) {
				return Array.prototype.indexOf.call(this, item);
			},
		};

		function LiveNodeList(node,refresh){
			this._node = node;
			this._refresh = refresh;
			_updateLiveList(this);
		}
		function _updateLiveList(list){
			var inc = list._node._inc || list._node.ownerDocument._inc;
			if (list._inc !== inc) {
				var ls = list._refresh(list._node);
				__set__(list,'length',ls.length);
				if (!list.$$length || ls.length < list.$$length) {
					for (var i = ls.length; i in list; i++) {
						if (Object.prototype.hasOwnProperty.call(list, i)) {
							delete list[i];
						}
					}
				}
				copy(ls,list);
				list._inc = inc;
			}
		}
		LiveNodeList.prototype.item = function(i){
			_updateLiveList(this);
			return this[i] || null;
		};

		_extends(LiveNodeList,NodeList);

		/**
		 * Objects implementing the NamedNodeMap interface are used
		 * to represent collections of nodes that can be accessed by name.
		 * Note that NamedNodeMap does not inherit from NodeList;
		 * NamedNodeMaps are not maintained in any particular order.
		 * Objects contained in an object implementing NamedNodeMap may also be accessed by an ordinal index,
		 * but this is simply to allow convenient enumeration of the contents of a NamedNodeMap,
		 * and does not imply that the DOM specifies an order to these Nodes.
		 * NamedNodeMap objects in the DOM are live.
		 * used for attributes or DocumentType entities
		 */
		function NamedNodeMap() {
		}
		function _findNodeIndex(list,node){
			var i = list.length;
			while(i--){
				if(list[i] === node){return i}
			}
		}

		function _addNamedNode(el,list,newAttr,oldAttr){
			if(oldAttr){
				list[_findNodeIndex(list,oldAttr)] = newAttr;
			}else {
				list[list.length++] = newAttr;
			}
			if(el){
				newAttr.ownerElement = el;
				var doc = el.ownerDocument;
				if(doc){
					oldAttr && _onRemoveAttribute(doc,el,oldAttr);
					_onAddAttribute(doc,el,newAttr);
				}
			}
		}
		function _removeNamedNode(el,list,attr){
			//console.log('remove attr:'+attr)
			var i = _findNodeIndex(list,attr);
			if(i>=0){
				var lastIndex = list.length-1;
				while(i<lastIndex){
					list[i] = list[++i];
				}
				list.length = lastIndex;
				if(el){
					var doc = el.ownerDocument;
					if(doc){
						_onRemoveAttribute(doc,el,attr);
						attr.ownerElement = null;
					}
				}
			}else {
				throw new DOMException(NOT_FOUND_ERR,new Error(el.tagName+'@'+attr))
			}
		}
		NamedNodeMap.prototype = {
			length:0,
			item:NodeList.prototype.item,
			getNamedItem: function(key) {
		//		if(key.indexOf(':')>0 || key == 'xmlns'){
		//			return null;
		//		}
				//console.log()
				var i = this.length;
				while(i--){
					var attr = this[i];
					//console.log(attr.nodeName,key)
					if(attr.nodeName == key){
						return attr;
					}
				}
			},
			setNamedItem: function(attr) {
				var el = attr.ownerElement;
				if(el && el!=this._ownerElement){
					throw new DOMException(INUSE_ATTRIBUTE_ERR);
				}
				var oldAttr = this.getNamedItem(attr.nodeName);
				_addNamedNode(this._ownerElement,this,attr,oldAttr);
				return oldAttr;
			},
			/* returns Node */
			setNamedItemNS: function(attr) {// raises: WRONG_DOCUMENT_ERR,NO_MODIFICATION_ALLOWED_ERR,INUSE_ATTRIBUTE_ERR
				var el = attr.ownerElement, oldAttr;
				if(el && el!=this._ownerElement){
					throw new DOMException(INUSE_ATTRIBUTE_ERR);
				}
				oldAttr = this.getNamedItemNS(attr.namespaceURI,attr.localName);
				_addNamedNode(this._ownerElement,this,attr,oldAttr);
				return oldAttr;
			},

			/* returns Node */
			removeNamedItem: function(key) {
				var attr = this.getNamedItem(key);
				_removeNamedNode(this._ownerElement,this,attr);
				return attr;


			},// raises: NOT_FOUND_ERR,NO_MODIFICATION_ALLOWED_ERR

			//for level2
			removeNamedItemNS:function(namespaceURI,localName){
				var attr = this.getNamedItemNS(namespaceURI,localName);
				_removeNamedNode(this._ownerElement,this,attr);
				return attr;
			},
			getNamedItemNS: function(namespaceURI, localName) {
				var i = this.length;
				while(i--){
					var node = this[i];
					if(node.localName == localName && node.namespaceURI == namespaceURI){
						return node;
					}
				}
				return null;
			}
		};

		/**
		 * The DOMImplementation interface represents an object providing methods
		 * which are not dependent on any particular document.
		 * Such an object is returned by the `Document.implementation` property.
		 *
		 * __The individual methods describe the differences compared to the specs.__
		 *
		 * @constructor
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation MDN
		 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-102161490 DOM Level 1 Core (Initial)
		 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#ID-102161490 DOM Level 2 Core
		 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-102161490 DOM Level 3 Core
		 * @see https://dom.spec.whatwg.org/#domimplementation DOM Living Standard
		 */
		function DOMImplementation() {
		}

		DOMImplementation.prototype = {
			/**
			 * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given feature is supported.
			 * The different implementations fairly diverged in what kind of features were reported.
			 * The latest version of the spec settled to force this method to always return true, where the functionality was accurate and in use.
			 *
			 * @deprecated It is deprecated and modern browsers return true in all cases.
			 *
			 * @param {string} feature
			 * @param {string} [version]
			 * @returns {boolean} always true
			 *
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
			 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
			 * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
			 */
			hasFeature: function(feature, version) {
					return true;
			},
			/**
			 * Creates an XML Document object of the specified type with its document element.
			 *
			 * __It behaves slightly different from the description in the living standard__:
			 * - There is no interface/class `XMLDocument`, it returns a `Document` instance.
			 * - `contentType`, `encoding`, `mode`, `origin`, `url` fields are currently not declared.
			 * - this implementation is not validating names or qualified names
			 *   (when parsing XML strings, the SAX parser takes care of that)
			 *
			 * @param {string|null} namespaceURI
			 * @param {string} qualifiedName
			 * @param {DocumentType=null} doctype
			 * @returns {Document}
			 *
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
			 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM Level 2 Core (initial)
			 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument  DOM Level 2 Core
			 *
			 * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
			 * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
			 * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
			 */
			createDocument: function(namespaceURI,  qualifiedName, doctype){
				var doc = new Document();
				doc.implementation = this;
				doc.childNodes = new NodeList();
				doc.doctype = doctype || null;
				if (doctype){
					doc.appendChild(doctype);
				}
				if (qualifiedName){
					var root = doc.createElementNS(namespaceURI, qualifiedName);
					doc.appendChild(root);
				}
				return doc;
			},
			/**
			 * Returns a doctype, with the given `qualifiedName`, `publicId`, and `systemId`.
			 *
			 * __This behavior is slightly different from the in the specs__:
			 * - this implementation is not validating names or qualified names
			 *   (when parsing XML strings, the SAX parser takes care of that)
			 *
			 * @param {string} qualifiedName
			 * @param {string} [publicId]
			 * @param {string} [systemId]
			 * @returns {DocumentType} which can either be used with `DOMImplementation.createDocument` upon document creation
			 * 				  or can be put into the document via methods like `Node.insertBefore()` or `Node.replaceChild()`
			 *
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType MDN
			 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM Level 2 Core
			 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living Standard
			 *
			 * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
			 * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
			 * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
			 */
			createDocumentType: function(qualifiedName, publicId, systemId){
				var node = new DocumentType();
				node.name = qualifiedName;
				node.nodeName = qualifiedName;
				node.publicId = publicId || '';
				node.systemId = systemId || '';

				return node;
			}
		};


		/**
		 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-1950641247
		 */

		function Node() {
		}
		Node.prototype = {
			firstChild : null,
			lastChild : null,
			previousSibling : null,
			nextSibling : null,
			attributes : null,
			parentNode : null,
			childNodes : null,
			ownerDocument : null,
			nodeValue : null,
			namespaceURI : null,
			prefix : null,
			localName : null,
			// Modified in DOM Level 2:
			insertBefore:function(newChild, refChild){//raises
				return _insertBefore(this,newChild,refChild);
			},
			replaceChild:function(newChild, oldChild){//raises
				_insertBefore(this, newChild,oldChild, assertPreReplacementValidityInDocument);
				if(oldChild){
					this.removeChild(oldChild);
				}
			},
			removeChild:function(oldChild){
				return _removeChild(this,oldChild);
			},
			appendChild:function(newChild){
				return this.insertBefore(newChild,null);
			},
			hasChildNodes:function(){
				return this.firstChild != null;
			},
			cloneNode:function(deep){
				return cloneNode(this.ownerDocument||this,this,deep);
			},
			// Modified in DOM Level 2:
			normalize:function(){
				var child = this.firstChild;
				while(child){
					var next = child.nextSibling;
					if(next && next.nodeType == TEXT_NODE && child.nodeType == TEXT_NODE){
						this.removeChild(next);
						child.appendData(next.data);
					}else {
						child.normalize();
						child = next;
					}
				}
			},
		  	// Introduced in DOM Level 2:
			isSupported:function(feature, version){
				return this.ownerDocument.implementation.hasFeature(feature,version);
			},
		    // Introduced in DOM Level 2:
		    hasAttributes:function(){
		    	return this.attributes.length>0;
		    },
			/**
			 * Look up the prefix associated to the given namespace URI, starting from this node.
			 * **The default namespace declarations are ignored by this method.**
			 * See Namespace Prefix Lookup for details on the algorithm used by this method.
			 *
			 * _Note: The implementation seems to be incomplete when compared to the algorithm described in the specs._
			 *
			 * @param {string | null} namespaceURI
			 * @returns {string | null}
			 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
			 * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
			 * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
			 * @see https://github.com/xmldom/xmldom/issues/322
			 */
		    lookupPrefix:function(namespaceURI){
		    	var el = this;
		    	while(el){
		    		var map = el._nsMap;
		    		//console.dir(map)
		    		if(map){
		    			for(var n in map){
								if (Object.prototype.hasOwnProperty.call(map, n) && map[n] === namespaceURI) {
									return n;
								}
		    			}
		    		}
		    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
		    	}
		    	return null;
		    },
		    // Introduced in DOM Level 3:
		    lookupNamespaceURI:function(prefix){
		    	var el = this;
		    	while(el){
		    		var map = el._nsMap;
		    		//console.dir(map)
		    		if(map){
		    			if(Object.prototype.hasOwnProperty.call(map, prefix)){
		    				return map[prefix] ;
		    			}
		    		}
		    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
		    	}
		    	return null;
		    },
		    // Introduced in DOM Level 3:
		    isDefaultNamespace:function(namespaceURI){
		    	var prefix = this.lookupPrefix(namespaceURI);
		    	return prefix == null;
		    }
		};


		function _xmlEncoder(c){
			return c == '<' && '&lt;' ||
		         c == '>' && '&gt;' ||
		         c == '&' && '&amp;' ||
		         c == '"' && '&quot;' ||
		         '&#'+c.charCodeAt()+';'
		}


		copy(NodeType,Node);
		copy(NodeType,Node.prototype);

		/**
		 * @param callback return true for continue,false for break
		 * @return boolean true: break visit;
		 */
		function _visitNode(node,callback){
			if(callback(node)){
				return true;
			}
			if(node = node.firstChild){
				do{
					if(_visitNode(node,callback)){return true}
		        }while(node=node.nextSibling)
		    }
		}



		function Document(){
			this.ownerDocument = this;
		}

		function _onAddAttribute(doc,el,newAttr){
			doc && doc._inc++;
			var ns = newAttr.namespaceURI ;
			if(ns === NAMESPACE.XMLNS){
				//update namespace
				el._nsMap[newAttr.prefix?newAttr.localName:''] = newAttr.value;
			}
		}

		function _onRemoveAttribute(doc,el,newAttr,remove){
			doc && doc._inc++;
			var ns = newAttr.namespaceURI ;
			if(ns === NAMESPACE.XMLNS){
				//update namespace
				delete el._nsMap[newAttr.prefix?newAttr.localName:''];
			}
		}

		/**
		 * Updates `el.childNodes`, updating the indexed items and it's `length`.
		 * Passing `newChild` means it will be appended.
		 * Otherwise it's assumed that an item has been removed,
		 * and `el.firstNode` and it's `.nextSibling` are used
		 * to walk the current list of child nodes.
		 *
		 * @param {Document} doc
		 * @param {Node} el
		 * @param {Node} [newChild]
		 * @private
		 */
		function _onUpdateChild (doc, el, newChild) {
			if(doc && doc._inc){
				doc._inc++;
				//update childNodes
				var cs = el.childNodes;
				if (newChild) {
					cs[cs.length++] = newChild;
				} else {
					var child = el.firstChild;
					var i = 0;
					while (child) {
						cs[i++] = child;
						child = child.nextSibling;
					}
					cs.length = i;
					delete cs[cs.length];
				}
			}
		}

		/**
		 * Removes the connections between `parentNode` and `child`
		 * and any existing `child.previousSibling` or `child.nextSibling`.
		 *
		 * @see https://github.com/xmldom/xmldom/issues/135
		 * @see https://github.com/xmldom/xmldom/issues/145
		 *
		 * @param {Node} parentNode
		 * @param {Node} child
		 * @returns {Node} the child that was removed.
		 * @private
		 */
		function _removeChild (parentNode, child) {
			var previous = child.previousSibling;
			var next = child.nextSibling;
			if (previous) {
				previous.nextSibling = next;
			} else {
				parentNode.firstChild = next;
			}
			if (next) {
				next.previousSibling = previous;
			} else {
				parentNode.lastChild = previous;
			}
			child.parentNode = null;
			child.previousSibling = null;
			child.nextSibling = null;
			_onUpdateChild(parentNode.ownerDocument, parentNode);
			return child;
		}

		/**
		 * Returns `true` if `node` can be a parent for insertion.
		 * @param {Node} node
		 * @returns {boolean}
		 */
		function hasValidParentNodeType(node) {
			return (
				node &&
				(node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE)
			);
		}

		/**
		 * Returns `true` if `node` can be inserted according to it's `nodeType`.
		 * @param {Node} node
		 * @returns {boolean}
		 */
		function hasInsertableNodeType(node) {
			return (
				node &&
				(isElementNode(node) ||
					isTextNode(node) ||
					isDocTypeNode(node) ||
					node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
					node.nodeType === Node.COMMENT_NODE ||
					node.nodeType === Node.PROCESSING_INSTRUCTION_NODE)
			);
		}

		/**
		 * Returns true if `node` is a DOCTYPE node
		 * @param {Node} node
		 * @returns {boolean}
		 */
		function isDocTypeNode(node) {
			return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
		}

		/**
		 * Returns true if the node is an element
		 * @param {Node} node
		 * @returns {boolean}
		 */
		function isElementNode(node) {
			return node && node.nodeType === Node.ELEMENT_NODE;
		}
		/**
		 * Returns true if `node` is a text node
		 * @param {Node} node
		 * @returns {boolean}
		 */
		function isTextNode(node) {
			return node && node.nodeType === Node.TEXT_NODE;
		}

		/**
		 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
		 * according to the presence and position of a doctype node on the same level.
		 *
		 * @param {Document} doc The document node
		 * @param {Node} child the node that would become the nextSibling if the element would be inserted
		 * @returns {boolean} `true` if an element can be inserted before child
		 * @private
		 * https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 */
		function isElementInsertionPossible(doc, child) {
			var parentChildNodes = doc.childNodes || [];
			if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
				return false;
			}
			var docTypeNode = find(parentChildNodes, isDocTypeNode);
			return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
		}

		/**
		 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
		 * according to the presence and position of a doctype node on the same level.
		 *
		 * @param {Node} doc The document node
		 * @param {Node} child the node that would become the nextSibling if the element would be inserted
		 * @returns {boolean} `true` if an element can be inserted before child
		 * @private
		 * https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 */
		function isElementReplacementPossible(doc, child) {
			var parentChildNodes = doc.childNodes || [];

			function hasElementChildThatIsNotChild(node) {
				return isElementNode(node) && node !== child;
			}

			if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
				return false;
			}
			var docTypeNode = find(parentChildNodes, isDocTypeNode);
			return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
		}

		/**
		 * @private
		 * Steps 1-5 of the checks before inserting and before replacing a child are the same.
		 *
		 * @param {Node} parent the parent node to insert `node` into
		 * @param {Node} node the node to insert
		 * @param {Node=} child the node that should become the `nextSibling` of `node`
		 * @returns {Node}
		 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
		 * @throws DOMException if `child` is provided but is not a child of `parent`.
		 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 * @see https://dom.spec.whatwg.org/#concept-node-replace
		 */
		function assertPreInsertionValidity1to5(parent, node, child) {
			// 1. If `parent` is not a Document, DocumentFragment, or Element node, then throw a "HierarchyRequestError" DOMException.
			if (!hasValidParentNodeType(parent)) {
				throw new DOMException(HIERARCHY_REQUEST_ERR, 'Unexpected parent node type ' + parent.nodeType);
			}
			// 2. If `node` is a host-including inclusive ancestor of `parent`, then throw a "HierarchyRequestError" DOMException.
			// not implemented!
			// 3. If `child` is non-null and its parent is not `parent`, then throw a "NotFoundError" DOMException.
			if (child && child.parentNode !== parent) {
				throw new DOMException(NOT_FOUND_ERR, 'child not in parent');
			}
			if (
				// 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
				!hasInsertableNodeType(node) ||
				// 5. If either `node` is a Text node and `parent` is a document,
				// the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
				// || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
				// or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
				(isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE)
			) {
				throw new DOMException(
					HIERARCHY_REQUEST_ERR,
					'Unexpected node type ' + node.nodeType + ' for parent node type ' + parent.nodeType
				);
			}
		}

		/**
		 * @private
		 * Step 6 of the checks before inserting and before replacing a child are different.
		 *
		 * @param {Document} parent the parent node to insert `node` into
		 * @param {Node} node the node to insert
		 * @param {Node | undefined} child the node that should become the `nextSibling` of `node`
		 * @returns {Node}
		 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
		 * @throws DOMException if `child` is provided but is not a child of `parent`.
		 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 * @see https://dom.spec.whatwg.org/#concept-node-replace
		 */
		function assertPreInsertionValidityInDocument(parent, node, child) {
			var parentChildNodes = parent.childNodes || [];
			var nodeChildNodes = node.childNodes || [];

			// DocumentFragment
			if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
				var nodeChildElements = nodeChildNodes.filter(isElementNode);
				// If node has more than one element child or has a Text node child.
				if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
				}
				// Otherwise, if `node` has one element child and either `parent` has an element child,
				// `child` is a doctype, or `child` is non-null and a doctype is following `child`.
				if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
				}
			}
			// Element
			if (isElementNode(node)) {
				// `parent` has an element child, `child` is a doctype,
				// or `child` is non-null and a doctype is following `child`.
				if (!isElementInsertionPossible(parent, child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
				}
			}
			// DocumentType
			if (isDocTypeNode(node)) {
				// `parent` has a doctype child,
				if (find(parentChildNodes, isDocTypeNode)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
				}
				var parentElementChild = find(parentChildNodes, isElementNode);
				// `child` is non-null and an element is preceding `child`,
				if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
				}
				// or `child` is null and `parent` has an element child.
				if (!child && parentElementChild) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can not be appended since element is present');
				}
			}
		}

		/**
		 * @private
		 * Step 6 of the checks before inserting and before replacing a child are different.
		 *
		 * @param {Document} parent the parent node to insert `node` into
		 * @param {Node} node the node to insert
		 * @param {Node | undefined} child the node that should become the `nextSibling` of `node`
		 * @returns {Node}
		 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
		 * @throws DOMException if `child` is provided but is not a child of `parent`.
		 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 * @see https://dom.spec.whatwg.org/#concept-node-replace
		 */
		function assertPreReplacementValidityInDocument(parent, node, child) {
			var parentChildNodes = parent.childNodes || [];
			var nodeChildNodes = node.childNodes || [];

			// DocumentFragment
			if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
				var nodeChildElements = nodeChildNodes.filter(isElementNode);
				// If `node` has more than one element child or has a Text node child.
				if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
				}
				// Otherwise, if `node` has one element child and either `parent` has an element child that is not `child` or a doctype is following `child`.
				if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
				}
			}
			// Element
			if (isElementNode(node)) {
				// `parent` has an element child that is not `child` or a doctype is following `child`.
				if (!isElementReplacementPossible(parent, child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
				}
			}
			// DocumentType
			if (isDocTypeNode(node)) {
				function hasDoctypeChildThatIsNotChild(node) {
					return isDocTypeNode(node) && node !== child;
				}

				// `parent` has a doctype child that is not `child`,
				if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
				}
				var parentElementChild = find(parentChildNodes, isElementNode);
				// or an element is preceding `child`.
				if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
					throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
				}
			}
		}

		/**
		 * @private
		 * @param {Node} parent the parent node to insert `node` into
		 * @param {Node} node the node to insert
		 * @param {Node=} child the node that should become the `nextSibling` of `node`
		 * @returns {Node}
		 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
		 * @throws DOMException if `child` is provided but is not a child of `parent`.
		 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
		 */
		function _insertBefore(parent, node, child, _inDocumentAssertion) {
			// To ensure pre-insertion validity of a node into a parent before a child, run these steps:
			assertPreInsertionValidity1to5(parent, node, child);

			// If parent is a document, and any of the statements below, switched on the interface node implements,
			// are true, then throw a "HierarchyRequestError" DOMException.
			if (parent.nodeType === Node.DOCUMENT_NODE) {
				(_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
			}

			var cp = node.parentNode;
			if(cp){
				cp.removeChild(node);//remove and update
			}
			if(node.nodeType === DOCUMENT_FRAGMENT_NODE){
				var newFirst = node.firstChild;
				if (newFirst == null) {
					return node;
				}
				var newLast = node.lastChild;
			}else {
				newFirst = newLast = node;
			}
			var pre = child ? child.previousSibling : parent.lastChild;

			newFirst.previousSibling = pre;
			newLast.nextSibling = child;


			if(pre){
				pre.nextSibling = newFirst;
			}else {
				parent.firstChild = newFirst;
			}
			if(child == null){
				parent.lastChild = newLast;
			}else {
				child.previousSibling = newLast;
			}
			do{
				newFirst.parentNode = parent;
				// Update ownerDocument for each node being inserted
				var targetDoc = parent.ownerDocument || parent;
				_updateOwnerDocument(newFirst, targetDoc);
			}while(newFirst !== newLast && (newFirst= newFirst.nextSibling))
			_onUpdateChild(parent.ownerDocument||parent, parent);
			//console.log(parent.lastChild.nextSibling == null)
			if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
				node.firstChild = node.lastChild = null;
			}
			return node;
		}

		/**
		 * Recursively updates the ownerDocument property for a node and all its descendants
		 * @param {Node} node
		 * @param {Document} newOwnerDocument
		 * @private
		 */
		function _updateOwnerDocument(node, newOwnerDocument) {
			if (node.ownerDocument === newOwnerDocument) {
				return;
			}
			
			node.ownerDocument = newOwnerDocument;
			
			// Update attributes if this is an element
			if (node.nodeType === ELEMENT_NODE && node.attributes) {
				for (var i = 0; i < node.attributes.length; i++) {
					var attr = node.attributes.item(i);
					if (attr) {
						attr.ownerDocument = newOwnerDocument;
					}
				}
			}
			
			// Recursively update child nodes
			var child = node.firstChild;
			while (child) {
				_updateOwnerDocument(child, newOwnerDocument);
				child = child.nextSibling;
			}
		}

		/**
		 * Appends `newChild` to `parentNode`.
		 * If `newChild` is already connected to a `parentNode` it is first removed from it.
		 *
		 * @see https://github.com/xmldom/xmldom/issues/135
		 * @see https://github.com/xmldom/xmldom/issues/145
		 * @param {Node} parentNode
		 * @param {Node} newChild
		 * @returns {Node}
		 * @private
		 */
		function _appendSingleChild (parentNode, newChild) {
			if (newChild.parentNode) {
				newChild.parentNode.removeChild(newChild);
			}
			newChild.parentNode = parentNode;
			newChild.previousSibling = parentNode.lastChild;
			newChild.nextSibling = null;
			if (newChild.previousSibling) {
				newChild.previousSibling.nextSibling = newChild;
			} else {
				parentNode.firstChild = newChild;
			}
			parentNode.lastChild = newChild;
			_onUpdateChild(parentNode.ownerDocument, parentNode, newChild);
			
			// Update ownerDocument for the new child and all its descendants
			var targetDoc = parentNode.ownerDocument || parentNode;
			_updateOwnerDocument(newChild, targetDoc);
			
			return newChild;
		}

		Document.prototype = {
			//implementation : null,
			nodeName :  '#document',
			nodeType :  DOCUMENT_NODE,
			/**
			 * The DocumentType node of the document.
			 *
			 * @readonly
			 * @type DocumentType
			 */
			doctype :  null,
			documentElement :  null,
			_inc : 1,

			insertBefore :  function(newChild, refChild){//raises
				if(newChild.nodeType == DOCUMENT_FRAGMENT_NODE){
					var child = newChild.firstChild;
					while(child){
						var next = child.nextSibling;
						this.insertBefore(child,refChild);
						child = next;
					}
					return newChild;
				}
				_insertBefore(this, newChild, refChild);
				_updateOwnerDocument(newChild, this);
				if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
					this.documentElement = newChild;
				}

				return newChild;
			},
			removeChild :  function(oldChild){
				if(this.documentElement == oldChild){
					this.documentElement = null;
				}
				return _removeChild(this,oldChild);
			},
			replaceChild: function (newChild, oldChild) {
				//raises
				_insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
				_updateOwnerDocument(newChild, this);
				if (oldChild) {
					this.removeChild(oldChild);
				}
				if (isElementNode(newChild)) {
					this.documentElement = newChild;
				}
			},
			// Introduced in DOM Level 2:
			importNode : function(importedNode,deep){
				return importNode(this,importedNode,deep);
			},
			// Introduced in DOM Level 2:
			getElementById :	function(id){
				var rtv = null;
				_visitNode(this.documentElement,function(node){
					if(node.nodeType == ELEMENT_NODE){
						if(node.getAttribute('id') == id){
							rtv = node;
							return true;
						}
					}
				});
				return rtv;
			},

			/**
			 * The `getElementsByClassName` method of `Document` interface returns an array-like object
			 * of all child elements which have **all** of the given class name(s).
			 *
			 * Returns an empty list if `classeNames` is an empty string or only contains HTML white space characters.
			 *
			 *
			 * Warning: This is a live LiveNodeList.
			 * Changes in the DOM will reflect in the array as the changes occur.
			 * If an element selected by this array no longer qualifies for the selector,
			 * it will automatically be removed. Be aware of this for iteration purposes.
			 *
			 * @param {string} classNames is a string representing the class name(s) to match; multiple class names are separated by (ASCII-)whitespace
			 *
			 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
			 * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
			 */
			getElementsByClassName: function(classNames) {
				var classNamesSet = toOrderedSet(classNames);
				return new LiveNodeList(this, function(base) {
					var ls = [];
					if (classNamesSet.length > 0) {
						_visitNode(base.documentElement, function(node) {
							if(node !== base && node.nodeType === ELEMENT_NODE) {
								var nodeClassNames = node.getAttribute('class');
								// can be null if the attribute does not exist
								if (nodeClassNames) {
									// before splitting and iterating just compare them for the most common case
									var matches = classNames === nodeClassNames;
									if (!matches) {
										var nodeClassNamesSet = toOrderedSet(nodeClassNames);
										matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
									}
									if(matches) {
										ls.push(node);
									}
								}
							}
						});
					}
					return ls;
				});
			},

			//document factory method:
			createElement :	function(tagName){
				var node = new Element();
				node.ownerDocument = this;
				node.nodeName = tagName;
				node.tagName = tagName;
				node.localName = tagName;
				node.childNodes = new NodeList();
				var attrs	= node.attributes = new NamedNodeMap();
				attrs._ownerElement = node;
				return node;
			},
			createDocumentFragment :	function(){
				var node = new DocumentFragment();
				node.ownerDocument = this;
				node.childNodes = new NodeList();
				return node;
			},
			createTextNode :	function(data){
				var node = new Text();
				node.ownerDocument = this;
				node.appendData(data);
				return node;
			},
			createComment :	function(data){
				var node = new Comment();
				node.ownerDocument = this;
				node.appendData(data);
				return node;
			},
			createCDATASection :	function(data){
				var node = new CDATASection();
				node.ownerDocument = this;
				node.appendData(data);
				return node;
			},
			createProcessingInstruction :	function(target,data){
				var node = new ProcessingInstruction();
				node.ownerDocument = this;
				node.tagName = node.nodeName = node.target = target;
				node.nodeValue = node.data = data;
				return node;
			},
			createAttribute :	function(name){
				var node = new Attr();
				node.ownerDocument	= this;
				node.name = name;
				node.nodeName	= name;
				node.localName = name;
				node.specified = true;
				return node;
			},
			createEntityReference :	function(name){
				var node = new EntityReference();
				node.ownerDocument	= this;
				node.nodeName	= name;
				return node;
			},
			// Introduced in DOM Level 2:
			createElementNS :	function(namespaceURI,qualifiedName){
				var node = new Element();
				var pl = qualifiedName.split(':');
				var attrs	= node.attributes = new NamedNodeMap();
				node.childNodes = new NodeList();
				node.ownerDocument = this;
				node.nodeName = qualifiedName;
				node.tagName = qualifiedName;
				node.namespaceURI = namespaceURI;
				if(pl.length == 2){
					node.prefix = pl[0];
					node.localName = pl[1];
				}else {
					//el.prefix = null;
					node.localName = qualifiedName;
				}
				attrs._ownerElement = node;
				return node;
			},
			// Introduced in DOM Level 2:
			createAttributeNS :	function(namespaceURI,qualifiedName){
				var node = new Attr();
				var pl = qualifiedName.split(':');
				node.ownerDocument = this;
				node.nodeName = qualifiedName;
				node.name = qualifiedName;
				node.namespaceURI = namespaceURI;
				node.specified = true;
				if(pl.length == 2){
					node.prefix = pl[0];
					node.localName = pl[1];
				}else {
					//el.prefix = null;
					node.localName = qualifiedName;
				}
				return node;
			}
		};
		_extends(Document,Node);


		function Element() {
			this._nsMap = {};
		}	Element.prototype = {
			nodeType : ELEMENT_NODE,
			hasAttribute : function(name){
				return this.getAttributeNode(name)!=null;
			},
			getAttribute : function(name){
				var attr = this.getAttributeNode(name);
				return attr && attr.value || '';
			},
			getAttributeNode : function(name){
				return this.attributes.getNamedItem(name);
			},
			setAttribute : function(name, value){
				var attr = this.ownerDocument.createAttribute(name);
				attr.value = attr.nodeValue = "" + value;
				this.setAttributeNode(attr);
			},
			removeAttribute : function(name){
				var attr = this.getAttributeNode(name);
				attr && this.removeAttributeNode(attr);
			},

			//four real opeartion method
			appendChild:function(newChild){
				if(newChild.nodeType === DOCUMENT_FRAGMENT_NODE){
					return this.insertBefore(newChild,null);
				}else {
					return _appendSingleChild(this,newChild);
				}
			},
			setAttributeNode : function(newAttr){
				return this.attributes.setNamedItem(newAttr);
			},
			setAttributeNodeNS : function(newAttr){
				return this.attributes.setNamedItemNS(newAttr);
			},
			removeAttributeNode : function(oldAttr){
				//console.log(this == oldAttr.ownerElement)
				return this.attributes.removeNamedItem(oldAttr.nodeName);
			},
			//get real attribute name,and remove it by removeAttributeNode
			removeAttributeNS : function(namespaceURI, localName){
				var old = this.getAttributeNodeNS(namespaceURI, localName);
				old && this.removeAttributeNode(old);
			},

			hasAttributeNS : function(namespaceURI, localName){
				return this.getAttributeNodeNS(namespaceURI, localName)!=null;
			},
			getAttributeNS : function(namespaceURI, localName){
				var attr = this.getAttributeNodeNS(namespaceURI, localName);
				return attr && attr.value || '';
			},
			setAttributeNS : function(namespaceURI, qualifiedName, value){
				var attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
				attr.value = attr.nodeValue = "" + value;
				this.setAttributeNode(attr);
			},
			getAttributeNodeNS : function(namespaceURI, localName){
				return this.attributes.getNamedItemNS(namespaceURI, localName);
			},

			getElementsByTagName : function(tagName){
				return new LiveNodeList(this,function(base){
					var ls = [];
					_visitNode(base,function(node){
						if(node !== base && node.nodeType == ELEMENT_NODE && (tagName === '*' || node.tagName == tagName)){
							ls.push(node);
						}
					});
					return ls;
				});
			},
			getElementsByTagNameNS : function(namespaceURI, localName){
				return new LiveNodeList(this,function(base){
					var ls = [];
					_visitNode(base,function(node){
						if(node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === '*' || node.namespaceURI === namespaceURI) && (localName === '*' || node.localName == localName)){
							ls.push(node);
						}
					});
					return ls;

				});
			}
		};
		Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
		Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;


		_extends(Element,Node);
		function Attr() {
		}	Attr.prototype.nodeType = ATTRIBUTE_NODE;
		_extends(Attr,Node);


		function CharacterData() {
		}	CharacterData.prototype = {
			data : '',
			substringData : function(offset, count) {
				return this.data.substring(offset, offset+count);
			},
			appendData: function(text) {
				text = this.data+text;
				this.nodeValue = this.data = text;
				this.length = text.length;
			},
			insertData: function(offset,text) {
				this.replaceData(offset,0,text);

			},
			appendChild:function(newChild){
				throw new Error(ExceptionMessage[HIERARCHY_REQUEST_ERR])
			},
			deleteData: function(offset, count) {
				this.replaceData(offset,count,"");
			},
			replaceData: function(offset, count, text) {
				var start = this.data.substring(0,offset);
				var end = this.data.substring(offset+count);
				text = start + text + end;
				this.nodeValue = this.data = text;
				this.length = text.length;
			}
		};
		_extends(CharacterData,Node);
		function Text() {
		}	Text.prototype = {
			nodeName : "#text",
			nodeType : TEXT_NODE,
			splitText : function(offset) {
				var text = this.data;
				var newText = text.substring(offset);
				text = text.substring(0, offset);
				this.data = this.nodeValue = text;
				this.length = text.length;
				var newNode = this.ownerDocument.createTextNode(newText);
				if(this.parentNode){
					this.parentNode.insertBefore(newNode, this.nextSibling);
				}
				return newNode;
			}
		};
		_extends(Text,CharacterData);
		function Comment() {
		}	Comment.prototype = {
			nodeName : "#comment",
			nodeType : COMMENT_NODE
		};
		_extends(Comment,CharacterData);

		function CDATASection() {
		}	CDATASection.prototype = {
			nodeName : "#cdata-section",
			nodeType : CDATA_SECTION_NODE
		};
		_extends(CDATASection,CharacterData);


		function DocumentType() {
		}	DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
		_extends(DocumentType,Node);

		function Notation() {
		}	Notation.prototype.nodeType = NOTATION_NODE;
		_extends(Notation,Node);

		function Entity() {
		}	Entity.prototype.nodeType = ENTITY_NODE;
		_extends(Entity,Node);

		function EntityReference() {
		}	EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
		_extends(EntityReference,Node);

		function DocumentFragment() {
		}	DocumentFragment.prototype.nodeName =	"#document-fragment";
		DocumentFragment.prototype.nodeType =	DOCUMENT_FRAGMENT_NODE;
		_extends(DocumentFragment,Node);


		function ProcessingInstruction() {
		}
		ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
		_extends(ProcessingInstruction,Node);
		function XMLSerializer(){}
		XMLSerializer.prototype.serializeToString = function(node,isHtml,nodeFilter){
			return nodeSerializeToString.call(node,isHtml,nodeFilter);
		};
		Node.prototype.toString = nodeSerializeToString;
		function nodeSerializeToString(isHtml,nodeFilter){
			var buf = [];
			var refNode = this.nodeType == 9 && this.documentElement || this;
			var prefix = refNode.prefix;
			var uri = refNode.namespaceURI;

			if(uri && prefix == null){
				//console.log(prefix)
				var prefix = refNode.lookupPrefix(uri);
				if(prefix == null){
					//isHTML = true;
					var visibleNamespaces=[
					{namespace:uri,prefix:null}
					//{namespace:uri,prefix:''}
					];
				}
			}
			serializeToString(this,buf,isHtml,nodeFilter,visibleNamespaces);
			//console.log('###',this.nodeType,uri,prefix,buf.join(''))
			return buf.join('');
		}

		function needNamespaceDefine(node, isHTML, visibleNamespaces) {
			var prefix = node.prefix || '';
			var uri = node.namespaceURI;
			// According to [Namespaces in XML 1.0](https://www.w3.org/TR/REC-xml-names/#ns-using) ,
			// and more specifically https://www.w3.org/TR/REC-xml-names/#nsc-NoPrefixUndecl :
			// > In a namespace declaration for a prefix [...], the attribute value MUST NOT be empty.
			// in a similar manner [Namespaces in XML 1.1](https://www.w3.org/TR/xml-names11/#ns-using)
			// and more specifically https://www.w3.org/TR/xml-names11/#nsc-NSDeclared :
			// > [...] Furthermore, the attribute value [...] must not be an empty string.
			// so serializing empty namespace value like xmlns:ds="" would produce an invalid XML document.
			if (!uri) {
				return false;
			}
			if (prefix === "xml" && uri === NAMESPACE.XML || uri === NAMESPACE.XMLNS) {
				return false;
			}

			var i = visibleNamespaces.length;
			while (i--) {
				var ns = visibleNamespaces[i];
				// get namespace prefix
				if (ns.prefix === prefix) {
					return ns.namespace !== uri;
				}
			}
			return true;
		}
		/**
		 * Well-formed constraint: No < in Attribute Values
		 * > The replacement text of any entity referred to directly or indirectly
		 * > in an attribute value must not contain a <.
		 * @see https://www.w3.org/TR/xml11/#CleanAttrVals
		 * @see https://www.w3.org/TR/xml11/#NT-AttValue
		 *
		 * Literal whitespace other than space that appear in attribute values
		 * are serialized as their entity references, so they will be preserved.
		 * (In contrast to whitespace literals in the input which are normalized to spaces)
		 * @see https://www.w3.org/TR/xml11/#AVNormalize
		 * @see https://w3c.github.io/DOM-Parsing/#serializing-an-element-s-attributes
		 */
		function addSerializedAttribute(buf, qualifiedName, value) {
			buf.push(' ', qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
		}

		function serializeToString(node,buf,isHTML,nodeFilter,visibleNamespaces){
			if (!visibleNamespaces) {
				visibleNamespaces = [];
			}

			if(nodeFilter){
				node = nodeFilter(node);
				if(node){
					if(typeof node == 'string'){
						buf.push(node);
						return;
					}
				}else {
					return;
				}
				//buf.sort.apply(attrs, attributeSorter);
			}

			switch(node.nodeType){
			case ELEMENT_NODE:
				var attrs = node.attributes;
				var len = attrs.length;
				var child = node.firstChild;
				var nodeName = node.tagName;

				isHTML = NAMESPACE.isHTML(node.namespaceURI) || isHTML;

				var prefixedNodeName = nodeName;
				if (!isHTML && !node.prefix && node.namespaceURI) {
					var defaultNS;
					// lookup current default ns from `xmlns` attribute
					for (var ai = 0; ai < attrs.length; ai++) {
						if (attrs.item(ai).name === 'xmlns') {
							defaultNS = attrs.item(ai).value;
							break
						}
					}
					if (!defaultNS) {
						// lookup current default ns in visibleNamespaces
						for (var nsi = visibleNamespaces.length - 1; nsi >= 0; nsi--) {
							var namespace = visibleNamespaces[nsi];
							if (namespace.prefix === '' && namespace.namespace === node.namespaceURI) {
								defaultNS = namespace.namespace;
								break
							}
						}
					}
					if (defaultNS !== node.namespaceURI) {
						for (var nsi = visibleNamespaces.length - 1; nsi >= 0; nsi--) {
							var namespace = visibleNamespaces[nsi];
							if (namespace.namespace === node.namespaceURI) {
								if (namespace.prefix) {
									prefixedNodeName = namespace.prefix + ':' + nodeName;
								}
								break
							}
						}
					}
				}

				buf.push('<', prefixedNodeName);

				for(var i=0;i<len;i++){
					// add namespaces for attributes
					var attr = attrs.item(i);
					if (attr.prefix == 'xmlns') {
						visibleNamespaces.push({ prefix: attr.localName, namespace: attr.value });
					}else if(attr.nodeName == 'xmlns'){
						visibleNamespaces.push({ prefix: '', namespace: attr.value });
					}
				}

				for(var i=0;i<len;i++){
					var attr = attrs.item(i);
					if (needNamespaceDefine(attr,isHTML, visibleNamespaces)) {
						var prefix = attr.prefix||'';
						var uri = attr.namespaceURI;
						addSerializedAttribute(buf, prefix ? 'xmlns:' + prefix : "xmlns", uri);
						visibleNamespaces.push({ prefix: prefix, namespace:uri });
					}
					serializeToString(attr,buf,isHTML,nodeFilter,visibleNamespaces);
				}

				// add namespace for current node
				if (nodeName === prefixedNodeName && needNamespaceDefine(node, isHTML, visibleNamespaces)) {
					var prefix = node.prefix||'';
					var uri = node.namespaceURI;
					addSerializedAttribute(buf, prefix ? 'xmlns:' + prefix : "xmlns", uri);
					visibleNamespaces.push({ prefix: prefix, namespace:uri });
				}

				if(child || isHTML && !/^(?:meta|link|img|br|hr|input)$/i.test(nodeName)){
					buf.push('>');
					//if is cdata child node
					if(isHTML && /^script$/i.test(nodeName)){
						while(child){
							if(child.data){
								buf.push(child.data);
							}else {
								serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
							}
							child = child.nextSibling;
						}
					}else
					{
						while(child){
							serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
							child = child.nextSibling;
						}
					}
					buf.push('</',prefixedNodeName,'>');
				}else {
					buf.push('/>');
				}
				// remove added visible namespaces
				//visibleNamespaces.length = startVisibleNamespaces;
				return;
			case DOCUMENT_NODE:
			case DOCUMENT_FRAGMENT_NODE:
				var child = node.firstChild;
				while(child){
					serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
					child = child.nextSibling;
				}
				return;
			case ATTRIBUTE_NODE:
				return addSerializedAttribute(buf, node.name, node.value);
			case TEXT_NODE:
				/**
				 * The ampersand character (&) and the left angle bracket (<) must not appear in their literal form,
				 * except when used as markup delimiters, or within a comment, a processing instruction, or a CDATA section.
				 * If they are needed elsewhere, they must be escaped using either numeric character references or the strings
				 * `&amp;` and `&lt;` respectively.
				 * The right angle bracket (>) may be represented using the string " &gt; ", and must, for compatibility,
				 * be escaped using either `&gt;` or a character reference when it appears in the string `]]>` in content,
				 * when that string is not marking the end of a CDATA section.
				 *
				 * In the content of elements, character data is any string of characters
				 * which does not contain the start-delimiter of any markup
				 * and does not include the CDATA-section-close delimiter, `]]>`.
				 *
				 * @see https://www.w3.org/TR/xml/#NT-CharData
				 * @see https://w3c.github.io/DOM-Parsing/#xml-serializing-a-text-node
				 */
				return buf.push(node.data
					.replace(/[<&>]/g,_xmlEncoder)
				);
			case CDATA_SECTION_NODE:
				return buf.push( '<![CDATA[',node.data,']]>');
			case COMMENT_NODE:
				return buf.push( "<!--",node.data,"-->");
			case DOCUMENT_TYPE_NODE:
				var pubid = node.publicId;
				var sysid = node.systemId;
				buf.push('<!DOCTYPE ',node.name);
				if(pubid){
					buf.push(' PUBLIC ', pubid);
					if (sysid && sysid!='.') {
						buf.push(' ', sysid);
					}
					buf.push('>');
				}else if(sysid && sysid!='.'){
					buf.push(' SYSTEM ', sysid, '>');
				}else {
					var sub = node.internalSubset;
					if(sub){
						buf.push(" [",sub,"]");
					}
					buf.push(">");
				}
				return;
			case PROCESSING_INSTRUCTION_NODE:
				return buf.push( "<?",node.target," ",node.data,"?>");
			case ENTITY_REFERENCE_NODE:
				return buf.push( '&',node.nodeName,';');
			//case ENTITY_NODE:
			//case NOTATION_NODE:
			default:
				buf.push('??',node.nodeName);
			}
		}
		function importNode(doc,node,deep){
			var node2;
			switch (node.nodeType) {
			case ELEMENT_NODE:
				node2 = node.cloneNode(false);
				node2.ownerDocument = doc;
				//var attrs = node2.attributes;
				//var len = attrs.length;
				//for(var i=0;i<len;i++){
					//node2.setAttributeNodeNS(importNode(doc,attrs.item(i),deep));
				//}
			case DOCUMENT_FRAGMENT_NODE:
				break;
			case ATTRIBUTE_NODE:
				deep = true;
				break;
			//case ENTITY_REFERENCE_NODE:
			//case PROCESSING_INSTRUCTION_NODE:
			////case TEXT_NODE:
			//case CDATA_SECTION_NODE:
			//case COMMENT_NODE:
			//	deep = false;
			//	break;
			//case DOCUMENT_NODE:
			//case DOCUMENT_TYPE_NODE:
			//cannot be imported.
			//case ENTITY_NODE:
			//case NOTATION_NODE：
			//can not hit in level3
			//default:throw e;
			}
			if(!node2){
				node2 = node.cloneNode(false);//false
			}
			node2.ownerDocument = doc;
			node2.parentNode = null;
			if(deep){
				var child = node.firstChild;
				while(child){
					node2.appendChild(importNode(doc,child,deep));
					child = child.nextSibling;
				}
			}
			return node2;
		}
		//
		//var _relationMap = {firstChild:1,lastChild:1,previousSibling:1,nextSibling:1,
		//					attributes:1,childNodes:1,parentNode:1,documentElement:1,doctype,};
		function cloneNode(doc,node,deep){
			var node2 = new node.constructor();
			for (var n in node) {
				if (Object.prototype.hasOwnProperty.call(node, n)) {
					var v = node[n];
					if (typeof v != "object") {
						if (v != node2[n]) {
							node2[n] = v;
						}
					}
				}
			}
			if(node.childNodes){
				node2.childNodes = new NodeList();
			}
			node2.ownerDocument = doc;
			switch (node2.nodeType) {
			case ELEMENT_NODE:
				var attrs	= node.attributes;
				var attrs2	= node2.attributes = new NamedNodeMap();
				var len = attrs.length;
				attrs2._ownerElement = node2;
				for(var i=0;i<len;i++){
					node2.setAttributeNode(cloneNode(doc,attrs.item(i),true));
				}
				break;		case ATTRIBUTE_NODE:
				deep = true;
			}
			if(deep){
				var child = node.firstChild;
				while(child){
					node2.appendChild(cloneNode(doc,child,deep));
					child = child.nextSibling;
				}
			}
			return node2;
		}

		function __set__(object,key,value){
			object[key] = value;
		}
		//do dynamic
		try{
			if(Object.defineProperty){
				Object.defineProperty(LiveNodeList.prototype,'length',{
					get:function(){
						_updateLiveList(this);
						return this.$$length;
					}
				});

				Object.defineProperty(Node.prototype,'textContent',{
					get:function(){
						return getTextContent(this);
					},

					set:function(data){
						switch(this.nodeType){
						case ELEMENT_NODE:
						case DOCUMENT_FRAGMENT_NODE:
							while(this.firstChild){
								this.removeChild(this.firstChild);
							}
							if(data || String(data)){
								this.appendChild(this.ownerDocument.createTextNode(data));
							}
							break;

						default:
							this.data = data;
							this.value = data;
							this.nodeValue = data;
						}
					}
				});

				function getTextContent(node){
					switch(node.nodeType){
					case ELEMENT_NODE:
					case DOCUMENT_FRAGMENT_NODE:
						var buf = [];
						node = node.firstChild;
						while(node){
							if(node.nodeType!==7 && node.nodeType !==8){
								buf.push(getTextContent(node));
							}
							node = node.nextSibling;
						}
						return buf.join('');
					default:
						return node.nodeValue;
					}
				}

				__set__ = function(object,key,value){
					//console.log(value)
					object['$$'+key] = value;
				};
			}
		}catch(e){//ie8
		}

		//if(typeof require == 'function'){
			dom.DocumentType = DocumentType;
			dom.DOMException = DOMException;
			dom.DOMImplementation = DOMImplementation;
			dom.Element = Element;
			dom.Node = Node;
			dom.NodeList = NodeList;
			dom.XMLSerializer = XMLSerializer;
		//}
		return dom;
	}

	var domParser = {};

	var entities = {};

	var hasRequiredEntities;

	function requireEntities () {
		if (hasRequiredEntities) return entities;
		hasRequiredEntities = 1;
		(function (exports$1) {

			var freeze = requireConventions().freeze;

			/**
			 * The entities that are predefined in every XML document.
			 *
			 * @see https://www.w3.org/TR/2006/REC-xml11-20060816/#sec-predefined-ent W3C XML 1.1
			 * @see https://www.w3.org/TR/2008/REC-xml-20081126/#sec-predefined-ent W3C XML 1.0
			 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Predefined_entities_in_XML Wikipedia
			 */
			exports$1.XML_ENTITIES = freeze({
				amp: '&',
				apos: "'",
				gt: '>',
				lt: '<',
				quot: '"',
			});

			/**
			 * A map of all entities that are detected in an HTML document.
			 * They contain all entries from `XML_ENTITIES`.
			 *
			 * @see XML_ENTITIES
			 * @see DOMParser.parseFromString
			 * @see DOMImplementation.prototype.createHTMLDocument
			 * @see https://html.spec.whatwg.org/#named-character-references WHATWG HTML(5) Spec
			 * @see https://html.spec.whatwg.org/entities.json JSON
			 * @see https://www.w3.org/TR/xml-entity-names/ W3C XML Entity Names
			 * @see https://www.w3.org/TR/html4/sgml/entities.html W3C HTML4/SGML
			 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Character_entity_references_in_HTML Wikipedia (HTML)
			 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Entities_representing_special_characters_in_XHTML Wikpedia (XHTML)
			 */
			exports$1.HTML_ENTITIES = freeze({
				Aacute: '\u00C1',
				aacute: '\u00E1',
				Abreve: '\u0102',
				abreve: '\u0103',
				ac: '\u223E',
				acd: '\u223F',
				acE: '\u223E\u0333',
				Acirc: '\u00C2',
				acirc: '\u00E2',
				acute: '\u00B4',
				Acy: '\u0410',
				acy: '\u0430',
				AElig: '\u00C6',
				aelig: '\u00E6',
				af: '\u2061',
				Afr: '\uD835\uDD04',
				afr: '\uD835\uDD1E',
				Agrave: '\u00C0',
				agrave: '\u00E0',
				alefsym: '\u2135',
				aleph: '\u2135',
				Alpha: '\u0391',
				alpha: '\u03B1',
				Amacr: '\u0100',
				amacr: '\u0101',
				amalg: '\u2A3F',
				AMP: '\u0026',
				amp: '\u0026',
				And: '\u2A53',
				and: '\u2227',
				andand: '\u2A55',
				andd: '\u2A5C',
				andslope: '\u2A58',
				andv: '\u2A5A',
				ang: '\u2220',
				ange: '\u29A4',
				angle: '\u2220',
				angmsd: '\u2221',
				angmsdaa: '\u29A8',
				angmsdab: '\u29A9',
				angmsdac: '\u29AA',
				angmsdad: '\u29AB',
				angmsdae: '\u29AC',
				angmsdaf: '\u29AD',
				angmsdag: '\u29AE',
				angmsdah: '\u29AF',
				angrt: '\u221F',
				angrtvb: '\u22BE',
				angrtvbd: '\u299D',
				angsph: '\u2222',
				angst: '\u00C5',
				angzarr: '\u237C',
				Aogon: '\u0104',
				aogon: '\u0105',
				Aopf: '\uD835\uDD38',
				aopf: '\uD835\uDD52',
				ap: '\u2248',
				apacir: '\u2A6F',
				apE: '\u2A70',
				ape: '\u224A',
				apid: '\u224B',
				apos: '\u0027',
				ApplyFunction: '\u2061',
				approx: '\u2248',
				approxeq: '\u224A',
				Aring: '\u00C5',
				aring: '\u00E5',
				Ascr: '\uD835\uDC9C',
				ascr: '\uD835\uDCB6',
				Assign: '\u2254',
				ast: '\u002A',
				asymp: '\u2248',
				asympeq: '\u224D',
				Atilde: '\u00C3',
				atilde: '\u00E3',
				Auml: '\u00C4',
				auml: '\u00E4',
				awconint: '\u2233',
				awint: '\u2A11',
				backcong: '\u224C',
				backepsilon: '\u03F6',
				backprime: '\u2035',
				backsim: '\u223D',
				backsimeq: '\u22CD',
				Backslash: '\u2216',
				Barv: '\u2AE7',
				barvee: '\u22BD',
				Barwed: '\u2306',
				barwed: '\u2305',
				barwedge: '\u2305',
				bbrk: '\u23B5',
				bbrktbrk: '\u23B6',
				bcong: '\u224C',
				Bcy: '\u0411',
				bcy: '\u0431',
				bdquo: '\u201E',
				becaus: '\u2235',
				Because: '\u2235',
				because: '\u2235',
				bemptyv: '\u29B0',
				bepsi: '\u03F6',
				bernou: '\u212C',
				Bernoullis: '\u212C',
				Beta: '\u0392',
				beta: '\u03B2',
				beth: '\u2136',
				between: '\u226C',
				Bfr: '\uD835\uDD05',
				bfr: '\uD835\uDD1F',
				bigcap: '\u22C2',
				bigcirc: '\u25EF',
				bigcup: '\u22C3',
				bigodot: '\u2A00',
				bigoplus: '\u2A01',
				bigotimes: '\u2A02',
				bigsqcup: '\u2A06',
				bigstar: '\u2605',
				bigtriangledown: '\u25BD',
				bigtriangleup: '\u25B3',
				biguplus: '\u2A04',
				bigvee: '\u22C1',
				bigwedge: '\u22C0',
				bkarow: '\u290D',
				blacklozenge: '\u29EB',
				blacksquare: '\u25AA',
				blacktriangle: '\u25B4',
				blacktriangledown: '\u25BE',
				blacktriangleleft: '\u25C2',
				blacktriangleright: '\u25B8',
				blank: '\u2423',
				blk12: '\u2592',
				blk14: '\u2591',
				blk34: '\u2593',
				block: '\u2588',
				bne: '\u003D\u20E5',
				bnequiv: '\u2261\u20E5',
				bNot: '\u2AED',
				bnot: '\u2310',
				Bopf: '\uD835\uDD39',
				bopf: '\uD835\uDD53',
				bot: '\u22A5',
				bottom: '\u22A5',
				bowtie: '\u22C8',
				boxbox: '\u29C9',
				boxDL: '\u2557',
				boxDl: '\u2556',
				boxdL: '\u2555',
				boxdl: '\u2510',
				boxDR: '\u2554',
				boxDr: '\u2553',
				boxdR: '\u2552',
				boxdr: '\u250C',
				boxH: '\u2550',
				boxh: '\u2500',
				boxHD: '\u2566',
				boxHd: '\u2564',
				boxhD: '\u2565',
				boxhd: '\u252C',
				boxHU: '\u2569',
				boxHu: '\u2567',
				boxhU: '\u2568',
				boxhu: '\u2534',
				boxminus: '\u229F',
				boxplus: '\u229E',
				boxtimes: '\u22A0',
				boxUL: '\u255D',
				boxUl: '\u255C',
				boxuL: '\u255B',
				boxul: '\u2518',
				boxUR: '\u255A',
				boxUr: '\u2559',
				boxuR: '\u2558',
				boxur: '\u2514',
				boxV: '\u2551',
				boxv: '\u2502',
				boxVH: '\u256C',
				boxVh: '\u256B',
				boxvH: '\u256A',
				boxvh: '\u253C',
				boxVL: '\u2563',
				boxVl: '\u2562',
				boxvL: '\u2561',
				boxvl: '\u2524',
				boxVR: '\u2560',
				boxVr: '\u255F',
				boxvR: '\u255E',
				boxvr: '\u251C',
				bprime: '\u2035',
				Breve: '\u02D8',
				breve: '\u02D8',
				brvbar: '\u00A6',
				Bscr: '\u212C',
				bscr: '\uD835\uDCB7',
				bsemi: '\u204F',
				bsim: '\u223D',
				bsime: '\u22CD',
				bsol: '\u005C',
				bsolb: '\u29C5',
				bsolhsub: '\u27C8',
				bull: '\u2022',
				bullet: '\u2022',
				bump: '\u224E',
				bumpE: '\u2AAE',
				bumpe: '\u224F',
				Bumpeq: '\u224E',
				bumpeq: '\u224F',
				Cacute: '\u0106',
				cacute: '\u0107',
				Cap: '\u22D2',
				cap: '\u2229',
				capand: '\u2A44',
				capbrcup: '\u2A49',
				capcap: '\u2A4B',
				capcup: '\u2A47',
				capdot: '\u2A40',
				CapitalDifferentialD: '\u2145',
				caps: '\u2229\uFE00',
				caret: '\u2041',
				caron: '\u02C7',
				Cayleys: '\u212D',
				ccaps: '\u2A4D',
				Ccaron: '\u010C',
				ccaron: '\u010D',
				Ccedil: '\u00C7',
				ccedil: '\u00E7',
				Ccirc: '\u0108',
				ccirc: '\u0109',
				Cconint: '\u2230',
				ccups: '\u2A4C',
				ccupssm: '\u2A50',
				Cdot: '\u010A',
				cdot: '\u010B',
				cedil: '\u00B8',
				Cedilla: '\u00B8',
				cemptyv: '\u29B2',
				cent: '\u00A2',
				CenterDot: '\u00B7',
				centerdot: '\u00B7',
				Cfr: '\u212D',
				cfr: '\uD835\uDD20',
				CHcy: '\u0427',
				chcy: '\u0447',
				check: '\u2713',
				checkmark: '\u2713',
				Chi: '\u03A7',
				chi: '\u03C7',
				cir: '\u25CB',
				circ: '\u02C6',
				circeq: '\u2257',
				circlearrowleft: '\u21BA',
				circlearrowright: '\u21BB',
				circledast: '\u229B',
				circledcirc: '\u229A',
				circleddash: '\u229D',
				CircleDot: '\u2299',
				circledR: '\u00AE',
				circledS: '\u24C8',
				CircleMinus: '\u2296',
				CirclePlus: '\u2295',
				CircleTimes: '\u2297',
				cirE: '\u29C3',
				cire: '\u2257',
				cirfnint: '\u2A10',
				cirmid: '\u2AEF',
				cirscir: '\u29C2',
				ClockwiseContourIntegral: '\u2232',
				CloseCurlyDoubleQuote: '\u201D',
				CloseCurlyQuote: '\u2019',
				clubs: '\u2663',
				clubsuit: '\u2663',
				Colon: '\u2237',
				colon: '\u003A',
				Colone: '\u2A74',
				colone: '\u2254',
				coloneq: '\u2254',
				comma: '\u002C',
				commat: '\u0040',
				comp: '\u2201',
				compfn: '\u2218',
				complement: '\u2201',
				complexes: '\u2102',
				cong: '\u2245',
				congdot: '\u2A6D',
				Congruent: '\u2261',
				Conint: '\u222F',
				conint: '\u222E',
				ContourIntegral: '\u222E',
				Copf: '\u2102',
				copf: '\uD835\uDD54',
				coprod: '\u2210',
				Coproduct: '\u2210',
				COPY: '\u00A9',
				copy: '\u00A9',
				copysr: '\u2117',
				CounterClockwiseContourIntegral: '\u2233',
				crarr: '\u21B5',
				Cross: '\u2A2F',
				cross: '\u2717',
				Cscr: '\uD835\uDC9E',
				cscr: '\uD835\uDCB8',
				csub: '\u2ACF',
				csube: '\u2AD1',
				csup: '\u2AD0',
				csupe: '\u2AD2',
				ctdot: '\u22EF',
				cudarrl: '\u2938',
				cudarrr: '\u2935',
				cuepr: '\u22DE',
				cuesc: '\u22DF',
				cularr: '\u21B6',
				cularrp: '\u293D',
				Cup: '\u22D3',
				cup: '\u222A',
				cupbrcap: '\u2A48',
				CupCap: '\u224D',
				cupcap: '\u2A46',
				cupcup: '\u2A4A',
				cupdot: '\u228D',
				cupor: '\u2A45',
				cups: '\u222A\uFE00',
				curarr: '\u21B7',
				curarrm: '\u293C',
				curlyeqprec: '\u22DE',
				curlyeqsucc: '\u22DF',
				curlyvee: '\u22CE',
				curlywedge: '\u22CF',
				curren: '\u00A4',
				curvearrowleft: '\u21B6',
				curvearrowright: '\u21B7',
				cuvee: '\u22CE',
				cuwed: '\u22CF',
				cwconint: '\u2232',
				cwint: '\u2231',
				cylcty: '\u232D',
				Dagger: '\u2021',
				dagger: '\u2020',
				daleth: '\u2138',
				Darr: '\u21A1',
				dArr: '\u21D3',
				darr: '\u2193',
				dash: '\u2010',
				Dashv: '\u2AE4',
				dashv: '\u22A3',
				dbkarow: '\u290F',
				dblac: '\u02DD',
				Dcaron: '\u010E',
				dcaron: '\u010F',
				Dcy: '\u0414',
				dcy: '\u0434',
				DD: '\u2145',
				dd: '\u2146',
				ddagger: '\u2021',
				ddarr: '\u21CA',
				DDotrahd: '\u2911',
				ddotseq: '\u2A77',
				deg: '\u00B0',
				Del: '\u2207',
				Delta: '\u0394',
				delta: '\u03B4',
				demptyv: '\u29B1',
				dfisht: '\u297F',
				Dfr: '\uD835\uDD07',
				dfr: '\uD835\uDD21',
				dHar: '\u2965',
				dharl: '\u21C3',
				dharr: '\u21C2',
				DiacriticalAcute: '\u00B4',
				DiacriticalDot: '\u02D9',
				DiacriticalDoubleAcute: '\u02DD',
				DiacriticalGrave: '\u0060',
				DiacriticalTilde: '\u02DC',
				diam: '\u22C4',
				Diamond: '\u22C4',
				diamond: '\u22C4',
				diamondsuit: '\u2666',
				diams: '\u2666',
				die: '\u00A8',
				DifferentialD: '\u2146',
				digamma: '\u03DD',
				disin: '\u22F2',
				div: '\u00F7',
				divide: '\u00F7',
				divideontimes: '\u22C7',
				divonx: '\u22C7',
				DJcy: '\u0402',
				djcy: '\u0452',
				dlcorn: '\u231E',
				dlcrop: '\u230D',
				dollar: '\u0024',
				Dopf: '\uD835\uDD3B',
				dopf: '\uD835\uDD55',
				Dot: '\u00A8',
				dot: '\u02D9',
				DotDot: '\u20DC',
				doteq: '\u2250',
				doteqdot: '\u2251',
				DotEqual: '\u2250',
				dotminus: '\u2238',
				dotplus: '\u2214',
				dotsquare: '\u22A1',
				doublebarwedge: '\u2306',
				DoubleContourIntegral: '\u222F',
				DoubleDot: '\u00A8',
				DoubleDownArrow: '\u21D3',
				DoubleLeftArrow: '\u21D0',
				DoubleLeftRightArrow: '\u21D4',
				DoubleLeftTee: '\u2AE4',
				DoubleLongLeftArrow: '\u27F8',
				DoubleLongLeftRightArrow: '\u27FA',
				DoubleLongRightArrow: '\u27F9',
				DoubleRightArrow: '\u21D2',
				DoubleRightTee: '\u22A8',
				DoubleUpArrow: '\u21D1',
				DoubleUpDownArrow: '\u21D5',
				DoubleVerticalBar: '\u2225',
				DownArrow: '\u2193',
				Downarrow: '\u21D3',
				downarrow: '\u2193',
				DownArrowBar: '\u2913',
				DownArrowUpArrow: '\u21F5',
				DownBreve: '\u0311',
				downdownarrows: '\u21CA',
				downharpoonleft: '\u21C3',
				downharpoonright: '\u21C2',
				DownLeftRightVector: '\u2950',
				DownLeftTeeVector: '\u295E',
				DownLeftVector: '\u21BD',
				DownLeftVectorBar: '\u2956',
				DownRightTeeVector: '\u295F',
				DownRightVector: '\u21C1',
				DownRightVectorBar: '\u2957',
				DownTee: '\u22A4',
				DownTeeArrow: '\u21A7',
				drbkarow: '\u2910',
				drcorn: '\u231F',
				drcrop: '\u230C',
				Dscr: '\uD835\uDC9F',
				dscr: '\uD835\uDCB9',
				DScy: '\u0405',
				dscy: '\u0455',
				dsol: '\u29F6',
				Dstrok: '\u0110',
				dstrok: '\u0111',
				dtdot: '\u22F1',
				dtri: '\u25BF',
				dtrif: '\u25BE',
				duarr: '\u21F5',
				duhar: '\u296F',
				dwangle: '\u29A6',
				DZcy: '\u040F',
				dzcy: '\u045F',
				dzigrarr: '\u27FF',
				Eacute: '\u00C9',
				eacute: '\u00E9',
				easter: '\u2A6E',
				Ecaron: '\u011A',
				ecaron: '\u011B',
				ecir: '\u2256',
				Ecirc: '\u00CA',
				ecirc: '\u00EA',
				ecolon: '\u2255',
				Ecy: '\u042D',
				ecy: '\u044D',
				eDDot: '\u2A77',
				Edot: '\u0116',
				eDot: '\u2251',
				edot: '\u0117',
				ee: '\u2147',
				efDot: '\u2252',
				Efr: '\uD835\uDD08',
				efr: '\uD835\uDD22',
				eg: '\u2A9A',
				Egrave: '\u00C8',
				egrave: '\u00E8',
				egs: '\u2A96',
				egsdot: '\u2A98',
				el: '\u2A99',
				Element: '\u2208',
				elinters: '\u23E7',
				ell: '\u2113',
				els: '\u2A95',
				elsdot: '\u2A97',
				Emacr: '\u0112',
				emacr: '\u0113',
				empty: '\u2205',
				emptyset: '\u2205',
				EmptySmallSquare: '\u25FB',
				emptyv: '\u2205',
				EmptyVerySmallSquare: '\u25AB',
				emsp: '\u2003',
				emsp13: '\u2004',
				emsp14: '\u2005',
				ENG: '\u014A',
				eng: '\u014B',
				ensp: '\u2002',
				Eogon: '\u0118',
				eogon: '\u0119',
				Eopf: '\uD835\uDD3C',
				eopf: '\uD835\uDD56',
				epar: '\u22D5',
				eparsl: '\u29E3',
				eplus: '\u2A71',
				epsi: '\u03B5',
				Epsilon: '\u0395',
				epsilon: '\u03B5',
				epsiv: '\u03F5',
				eqcirc: '\u2256',
				eqcolon: '\u2255',
				eqsim: '\u2242',
				eqslantgtr: '\u2A96',
				eqslantless: '\u2A95',
				Equal: '\u2A75',
				equals: '\u003D',
				EqualTilde: '\u2242',
				equest: '\u225F',
				Equilibrium: '\u21CC',
				equiv: '\u2261',
				equivDD: '\u2A78',
				eqvparsl: '\u29E5',
				erarr: '\u2971',
				erDot: '\u2253',
				Escr: '\u2130',
				escr: '\u212F',
				esdot: '\u2250',
				Esim: '\u2A73',
				esim: '\u2242',
				Eta: '\u0397',
				eta: '\u03B7',
				ETH: '\u00D0',
				eth: '\u00F0',
				Euml: '\u00CB',
				euml: '\u00EB',
				euro: '\u20AC',
				excl: '\u0021',
				exist: '\u2203',
				Exists: '\u2203',
				expectation: '\u2130',
				ExponentialE: '\u2147',
				exponentiale: '\u2147',
				fallingdotseq: '\u2252',
				Fcy: '\u0424',
				fcy: '\u0444',
				female: '\u2640',
				ffilig: '\uFB03',
				fflig: '\uFB00',
				ffllig: '\uFB04',
				Ffr: '\uD835\uDD09',
				ffr: '\uD835\uDD23',
				filig: '\uFB01',
				FilledSmallSquare: '\u25FC',
				FilledVerySmallSquare: '\u25AA',
				fjlig: '\u0066\u006A',
				flat: '\u266D',
				fllig: '\uFB02',
				fltns: '\u25B1',
				fnof: '\u0192',
				Fopf: '\uD835\uDD3D',
				fopf: '\uD835\uDD57',
				ForAll: '\u2200',
				forall: '\u2200',
				fork: '\u22D4',
				forkv: '\u2AD9',
				Fouriertrf: '\u2131',
				fpartint: '\u2A0D',
				frac12: '\u00BD',
				frac13: '\u2153',
				frac14: '\u00BC',
				frac15: '\u2155',
				frac16: '\u2159',
				frac18: '\u215B',
				frac23: '\u2154',
				frac25: '\u2156',
				frac34: '\u00BE',
				frac35: '\u2157',
				frac38: '\u215C',
				frac45: '\u2158',
				frac56: '\u215A',
				frac58: '\u215D',
				frac78: '\u215E',
				frasl: '\u2044',
				frown: '\u2322',
				Fscr: '\u2131',
				fscr: '\uD835\uDCBB',
				gacute: '\u01F5',
				Gamma: '\u0393',
				gamma: '\u03B3',
				Gammad: '\u03DC',
				gammad: '\u03DD',
				gap: '\u2A86',
				Gbreve: '\u011E',
				gbreve: '\u011F',
				Gcedil: '\u0122',
				Gcirc: '\u011C',
				gcirc: '\u011D',
				Gcy: '\u0413',
				gcy: '\u0433',
				Gdot: '\u0120',
				gdot: '\u0121',
				gE: '\u2267',
				ge: '\u2265',
				gEl: '\u2A8C',
				gel: '\u22DB',
				geq: '\u2265',
				geqq: '\u2267',
				geqslant: '\u2A7E',
				ges: '\u2A7E',
				gescc: '\u2AA9',
				gesdot: '\u2A80',
				gesdoto: '\u2A82',
				gesdotol: '\u2A84',
				gesl: '\u22DB\uFE00',
				gesles: '\u2A94',
				Gfr: '\uD835\uDD0A',
				gfr: '\uD835\uDD24',
				Gg: '\u22D9',
				gg: '\u226B',
				ggg: '\u22D9',
				gimel: '\u2137',
				GJcy: '\u0403',
				gjcy: '\u0453',
				gl: '\u2277',
				gla: '\u2AA5',
				glE: '\u2A92',
				glj: '\u2AA4',
				gnap: '\u2A8A',
				gnapprox: '\u2A8A',
				gnE: '\u2269',
				gne: '\u2A88',
				gneq: '\u2A88',
				gneqq: '\u2269',
				gnsim: '\u22E7',
				Gopf: '\uD835\uDD3E',
				gopf: '\uD835\uDD58',
				grave: '\u0060',
				GreaterEqual: '\u2265',
				GreaterEqualLess: '\u22DB',
				GreaterFullEqual: '\u2267',
				GreaterGreater: '\u2AA2',
				GreaterLess: '\u2277',
				GreaterSlantEqual: '\u2A7E',
				GreaterTilde: '\u2273',
				Gscr: '\uD835\uDCA2',
				gscr: '\u210A',
				gsim: '\u2273',
				gsime: '\u2A8E',
				gsiml: '\u2A90',
				Gt: '\u226B',
				GT: '\u003E',
				gt: '\u003E',
				gtcc: '\u2AA7',
				gtcir: '\u2A7A',
				gtdot: '\u22D7',
				gtlPar: '\u2995',
				gtquest: '\u2A7C',
				gtrapprox: '\u2A86',
				gtrarr: '\u2978',
				gtrdot: '\u22D7',
				gtreqless: '\u22DB',
				gtreqqless: '\u2A8C',
				gtrless: '\u2277',
				gtrsim: '\u2273',
				gvertneqq: '\u2269\uFE00',
				gvnE: '\u2269\uFE00',
				Hacek: '\u02C7',
				hairsp: '\u200A',
				half: '\u00BD',
				hamilt: '\u210B',
				HARDcy: '\u042A',
				hardcy: '\u044A',
				hArr: '\u21D4',
				harr: '\u2194',
				harrcir: '\u2948',
				harrw: '\u21AD',
				Hat: '\u005E',
				hbar: '\u210F',
				Hcirc: '\u0124',
				hcirc: '\u0125',
				hearts: '\u2665',
				heartsuit: '\u2665',
				hellip: '\u2026',
				hercon: '\u22B9',
				Hfr: '\u210C',
				hfr: '\uD835\uDD25',
				HilbertSpace: '\u210B',
				hksearow: '\u2925',
				hkswarow: '\u2926',
				hoarr: '\u21FF',
				homtht: '\u223B',
				hookleftarrow: '\u21A9',
				hookrightarrow: '\u21AA',
				Hopf: '\u210D',
				hopf: '\uD835\uDD59',
				horbar: '\u2015',
				HorizontalLine: '\u2500',
				Hscr: '\u210B',
				hscr: '\uD835\uDCBD',
				hslash: '\u210F',
				Hstrok: '\u0126',
				hstrok: '\u0127',
				HumpDownHump: '\u224E',
				HumpEqual: '\u224F',
				hybull: '\u2043',
				hyphen: '\u2010',
				Iacute: '\u00CD',
				iacute: '\u00ED',
				ic: '\u2063',
				Icirc: '\u00CE',
				icirc: '\u00EE',
				Icy: '\u0418',
				icy: '\u0438',
				Idot: '\u0130',
				IEcy: '\u0415',
				iecy: '\u0435',
				iexcl: '\u00A1',
				iff: '\u21D4',
				Ifr: '\u2111',
				ifr: '\uD835\uDD26',
				Igrave: '\u00CC',
				igrave: '\u00EC',
				ii: '\u2148',
				iiiint: '\u2A0C',
				iiint: '\u222D',
				iinfin: '\u29DC',
				iiota: '\u2129',
				IJlig: '\u0132',
				ijlig: '\u0133',
				Im: '\u2111',
				Imacr: '\u012A',
				imacr: '\u012B',
				image: '\u2111',
				ImaginaryI: '\u2148',
				imagline: '\u2110',
				imagpart: '\u2111',
				imath: '\u0131',
				imof: '\u22B7',
				imped: '\u01B5',
				Implies: '\u21D2',
				in: '\u2208',
				incare: '\u2105',
				infin: '\u221E',
				infintie: '\u29DD',
				inodot: '\u0131',
				Int: '\u222C',
				int: '\u222B',
				intcal: '\u22BA',
				integers: '\u2124',
				Integral: '\u222B',
				intercal: '\u22BA',
				Intersection: '\u22C2',
				intlarhk: '\u2A17',
				intprod: '\u2A3C',
				InvisibleComma: '\u2063',
				InvisibleTimes: '\u2062',
				IOcy: '\u0401',
				iocy: '\u0451',
				Iogon: '\u012E',
				iogon: '\u012F',
				Iopf: '\uD835\uDD40',
				iopf: '\uD835\uDD5A',
				Iota: '\u0399',
				iota: '\u03B9',
				iprod: '\u2A3C',
				iquest: '\u00BF',
				Iscr: '\u2110',
				iscr: '\uD835\uDCBE',
				isin: '\u2208',
				isindot: '\u22F5',
				isinE: '\u22F9',
				isins: '\u22F4',
				isinsv: '\u22F3',
				isinv: '\u2208',
				it: '\u2062',
				Itilde: '\u0128',
				itilde: '\u0129',
				Iukcy: '\u0406',
				iukcy: '\u0456',
				Iuml: '\u00CF',
				iuml: '\u00EF',
				Jcirc: '\u0134',
				jcirc: '\u0135',
				Jcy: '\u0419',
				jcy: '\u0439',
				Jfr: '\uD835\uDD0D',
				jfr: '\uD835\uDD27',
				jmath: '\u0237',
				Jopf: '\uD835\uDD41',
				jopf: '\uD835\uDD5B',
				Jscr: '\uD835\uDCA5',
				jscr: '\uD835\uDCBF',
				Jsercy: '\u0408',
				jsercy: '\u0458',
				Jukcy: '\u0404',
				jukcy: '\u0454',
				Kappa: '\u039A',
				kappa: '\u03BA',
				kappav: '\u03F0',
				Kcedil: '\u0136',
				kcedil: '\u0137',
				Kcy: '\u041A',
				kcy: '\u043A',
				Kfr: '\uD835\uDD0E',
				kfr: '\uD835\uDD28',
				kgreen: '\u0138',
				KHcy: '\u0425',
				khcy: '\u0445',
				KJcy: '\u040C',
				kjcy: '\u045C',
				Kopf: '\uD835\uDD42',
				kopf: '\uD835\uDD5C',
				Kscr: '\uD835\uDCA6',
				kscr: '\uD835\uDCC0',
				lAarr: '\u21DA',
				Lacute: '\u0139',
				lacute: '\u013A',
				laemptyv: '\u29B4',
				lagran: '\u2112',
				Lambda: '\u039B',
				lambda: '\u03BB',
				Lang: '\u27EA',
				lang: '\u27E8',
				langd: '\u2991',
				langle: '\u27E8',
				lap: '\u2A85',
				Laplacetrf: '\u2112',
				laquo: '\u00AB',
				Larr: '\u219E',
				lArr: '\u21D0',
				larr: '\u2190',
				larrb: '\u21E4',
				larrbfs: '\u291F',
				larrfs: '\u291D',
				larrhk: '\u21A9',
				larrlp: '\u21AB',
				larrpl: '\u2939',
				larrsim: '\u2973',
				larrtl: '\u21A2',
				lat: '\u2AAB',
				lAtail: '\u291B',
				latail: '\u2919',
				late: '\u2AAD',
				lates: '\u2AAD\uFE00',
				lBarr: '\u290E',
				lbarr: '\u290C',
				lbbrk: '\u2772',
				lbrace: '\u007B',
				lbrack: '\u005B',
				lbrke: '\u298B',
				lbrksld: '\u298F',
				lbrkslu: '\u298D',
				Lcaron: '\u013D',
				lcaron: '\u013E',
				Lcedil: '\u013B',
				lcedil: '\u013C',
				lceil: '\u2308',
				lcub: '\u007B',
				Lcy: '\u041B',
				lcy: '\u043B',
				ldca: '\u2936',
				ldquo: '\u201C',
				ldquor: '\u201E',
				ldrdhar: '\u2967',
				ldrushar: '\u294B',
				ldsh: '\u21B2',
				lE: '\u2266',
				le: '\u2264',
				LeftAngleBracket: '\u27E8',
				LeftArrow: '\u2190',
				Leftarrow: '\u21D0',
				leftarrow: '\u2190',
				LeftArrowBar: '\u21E4',
				LeftArrowRightArrow: '\u21C6',
				leftarrowtail: '\u21A2',
				LeftCeiling: '\u2308',
				LeftDoubleBracket: '\u27E6',
				LeftDownTeeVector: '\u2961',
				LeftDownVector: '\u21C3',
				LeftDownVectorBar: '\u2959',
				LeftFloor: '\u230A',
				leftharpoondown: '\u21BD',
				leftharpoonup: '\u21BC',
				leftleftarrows: '\u21C7',
				LeftRightArrow: '\u2194',
				Leftrightarrow: '\u21D4',
				leftrightarrow: '\u2194',
				leftrightarrows: '\u21C6',
				leftrightharpoons: '\u21CB',
				leftrightsquigarrow: '\u21AD',
				LeftRightVector: '\u294E',
				LeftTee: '\u22A3',
				LeftTeeArrow: '\u21A4',
				LeftTeeVector: '\u295A',
				leftthreetimes: '\u22CB',
				LeftTriangle: '\u22B2',
				LeftTriangleBar: '\u29CF',
				LeftTriangleEqual: '\u22B4',
				LeftUpDownVector: '\u2951',
				LeftUpTeeVector: '\u2960',
				LeftUpVector: '\u21BF',
				LeftUpVectorBar: '\u2958',
				LeftVector: '\u21BC',
				LeftVectorBar: '\u2952',
				lEg: '\u2A8B',
				leg: '\u22DA',
				leq: '\u2264',
				leqq: '\u2266',
				leqslant: '\u2A7D',
				les: '\u2A7D',
				lescc: '\u2AA8',
				lesdot: '\u2A7F',
				lesdoto: '\u2A81',
				lesdotor: '\u2A83',
				lesg: '\u22DA\uFE00',
				lesges: '\u2A93',
				lessapprox: '\u2A85',
				lessdot: '\u22D6',
				lesseqgtr: '\u22DA',
				lesseqqgtr: '\u2A8B',
				LessEqualGreater: '\u22DA',
				LessFullEqual: '\u2266',
				LessGreater: '\u2276',
				lessgtr: '\u2276',
				LessLess: '\u2AA1',
				lesssim: '\u2272',
				LessSlantEqual: '\u2A7D',
				LessTilde: '\u2272',
				lfisht: '\u297C',
				lfloor: '\u230A',
				Lfr: '\uD835\uDD0F',
				lfr: '\uD835\uDD29',
				lg: '\u2276',
				lgE: '\u2A91',
				lHar: '\u2962',
				lhard: '\u21BD',
				lharu: '\u21BC',
				lharul: '\u296A',
				lhblk: '\u2584',
				LJcy: '\u0409',
				ljcy: '\u0459',
				Ll: '\u22D8',
				ll: '\u226A',
				llarr: '\u21C7',
				llcorner: '\u231E',
				Lleftarrow: '\u21DA',
				llhard: '\u296B',
				lltri: '\u25FA',
				Lmidot: '\u013F',
				lmidot: '\u0140',
				lmoust: '\u23B0',
				lmoustache: '\u23B0',
				lnap: '\u2A89',
				lnapprox: '\u2A89',
				lnE: '\u2268',
				lne: '\u2A87',
				lneq: '\u2A87',
				lneqq: '\u2268',
				lnsim: '\u22E6',
				loang: '\u27EC',
				loarr: '\u21FD',
				lobrk: '\u27E6',
				LongLeftArrow: '\u27F5',
				Longleftarrow: '\u27F8',
				longleftarrow: '\u27F5',
				LongLeftRightArrow: '\u27F7',
				Longleftrightarrow: '\u27FA',
				longleftrightarrow: '\u27F7',
				longmapsto: '\u27FC',
				LongRightArrow: '\u27F6',
				Longrightarrow: '\u27F9',
				longrightarrow: '\u27F6',
				looparrowleft: '\u21AB',
				looparrowright: '\u21AC',
				lopar: '\u2985',
				Lopf: '\uD835\uDD43',
				lopf: '\uD835\uDD5D',
				loplus: '\u2A2D',
				lotimes: '\u2A34',
				lowast: '\u2217',
				lowbar: '\u005F',
				LowerLeftArrow: '\u2199',
				LowerRightArrow: '\u2198',
				loz: '\u25CA',
				lozenge: '\u25CA',
				lozf: '\u29EB',
				lpar: '\u0028',
				lparlt: '\u2993',
				lrarr: '\u21C6',
				lrcorner: '\u231F',
				lrhar: '\u21CB',
				lrhard: '\u296D',
				lrm: '\u200E',
				lrtri: '\u22BF',
				lsaquo: '\u2039',
				Lscr: '\u2112',
				lscr: '\uD835\uDCC1',
				Lsh: '\u21B0',
				lsh: '\u21B0',
				lsim: '\u2272',
				lsime: '\u2A8D',
				lsimg: '\u2A8F',
				lsqb: '\u005B',
				lsquo: '\u2018',
				lsquor: '\u201A',
				Lstrok: '\u0141',
				lstrok: '\u0142',
				Lt: '\u226A',
				LT: '\u003C',
				lt: '\u003C',
				ltcc: '\u2AA6',
				ltcir: '\u2A79',
				ltdot: '\u22D6',
				lthree: '\u22CB',
				ltimes: '\u22C9',
				ltlarr: '\u2976',
				ltquest: '\u2A7B',
				ltri: '\u25C3',
				ltrie: '\u22B4',
				ltrif: '\u25C2',
				ltrPar: '\u2996',
				lurdshar: '\u294A',
				luruhar: '\u2966',
				lvertneqq: '\u2268\uFE00',
				lvnE: '\u2268\uFE00',
				macr: '\u00AF',
				male: '\u2642',
				malt: '\u2720',
				maltese: '\u2720',
				Map: '\u2905',
				map: '\u21A6',
				mapsto: '\u21A6',
				mapstodown: '\u21A7',
				mapstoleft: '\u21A4',
				mapstoup: '\u21A5',
				marker: '\u25AE',
				mcomma: '\u2A29',
				Mcy: '\u041C',
				mcy: '\u043C',
				mdash: '\u2014',
				mDDot: '\u223A',
				measuredangle: '\u2221',
				MediumSpace: '\u205F',
				Mellintrf: '\u2133',
				Mfr: '\uD835\uDD10',
				mfr: '\uD835\uDD2A',
				mho: '\u2127',
				micro: '\u00B5',
				mid: '\u2223',
				midast: '\u002A',
				midcir: '\u2AF0',
				middot: '\u00B7',
				minus: '\u2212',
				minusb: '\u229F',
				minusd: '\u2238',
				minusdu: '\u2A2A',
				MinusPlus: '\u2213',
				mlcp: '\u2ADB',
				mldr: '\u2026',
				mnplus: '\u2213',
				models: '\u22A7',
				Mopf: '\uD835\uDD44',
				mopf: '\uD835\uDD5E',
				mp: '\u2213',
				Mscr: '\u2133',
				mscr: '\uD835\uDCC2',
				mstpos: '\u223E',
				Mu: '\u039C',
				mu: '\u03BC',
				multimap: '\u22B8',
				mumap: '\u22B8',
				nabla: '\u2207',
				Nacute: '\u0143',
				nacute: '\u0144',
				nang: '\u2220\u20D2',
				nap: '\u2249',
				napE: '\u2A70\u0338',
				napid: '\u224B\u0338',
				napos: '\u0149',
				napprox: '\u2249',
				natur: '\u266E',
				natural: '\u266E',
				naturals: '\u2115',
				nbsp: '\u00A0',
				nbump: '\u224E\u0338',
				nbumpe: '\u224F\u0338',
				ncap: '\u2A43',
				Ncaron: '\u0147',
				ncaron: '\u0148',
				Ncedil: '\u0145',
				ncedil: '\u0146',
				ncong: '\u2247',
				ncongdot: '\u2A6D\u0338',
				ncup: '\u2A42',
				Ncy: '\u041D',
				ncy: '\u043D',
				ndash: '\u2013',
				ne: '\u2260',
				nearhk: '\u2924',
				neArr: '\u21D7',
				nearr: '\u2197',
				nearrow: '\u2197',
				nedot: '\u2250\u0338',
				NegativeMediumSpace: '\u200B',
				NegativeThickSpace: '\u200B',
				NegativeThinSpace: '\u200B',
				NegativeVeryThinSpace: '\u200B',
				nequiv: '\u2262',
				nesear: '\u2928',
				nesim: '\u2242\u0338',
				NestedGreaterGreater: '\u226B',
				NestedLessLess: '\u226A',
				NewLine: '\u000A',
				nexist: '\u2204',
				nexists: '\u2204',
				Nfr: '\uD835\uDD11',
				nfr: '\uD835\uDD2B',
				ngE: '\u2267\u0338',
				nge: '\u2271',
				ngeq: '\u2271',
				ngeqq: '\u2267\u0338',
				ngeqslant: '\u2A7E\u0338',
				nges: '\u2A7E\u0338',
				nGg: '\u22D9\u0338',
				ngsim: '\u2275',
				nGt: '\u226B\u20D2',
				ngt: '\u226F',
				ngtr: '\u226F',
				nGtv: '\u226B\u0338',
				nhArr: '\u21CE',
				nharr: '\u21AE',
				nhpar: '\u2AF2',
				ni: '\u220B',
				nis: '\u22FC',
				nisd: '\u22FA',
				niv: '\u220B',
				NJcy: '\u040A',
				njcy: '\u045A',
				nlArr: '\u21CD',
				nlarr: '\u219A',
				nldr: '\u2025',
				nlE: '\u2266\u0338',
				nle: '\u2270',
				nLeftarrow: '\u21CD',
				nleftarrow: '\u219A',
				nLeftrightarrow: '\u21CE',
				nleftrightarrow: '\u21AE',
				nleq: '\u2270',
				nleqq: '\u2266\u0338',
				nleqslant: '\u2A7D\u0338',
				nles: '\u2A7D\u0338',
				nless: '\u226E',
				nLl: '\u22D8\u0338',
				nlsim: '\u2274',
				nLt: '\u226A\u20D2',
				nlt: '\u226E',
				nltri: '\u22EA',
				nltrie: '\u22EC',
				nLtv: '\u226A\u0338',
				nmid: '\u2224',
				NoBreak: '\u2060',
				NonBreakingSpace: '\u00A0',
				Nopf: '\u2115',
				nopf: '\uD835\uDD5F',
				Not: '\u2AEC',
				not: '\u00AC',
				NotCongruent: '\u2262',
				NotCupCap: '\u226D',
				NotDoubleVerticalBar: '\u2226',
				NotElement: '\u2209',
				NotEqual: '\u2260',
				NotEqualTilde: '\u2242\u0338',
				NotExists: '\u2204',
				NotGreater: '\u226F',
				NotGreaterEqual: '\u2271',
				NotGreaterFullEqual: '\u2267\u0338',
				NotGreaterGreater: '\u226B\u0338',
				NotGreaterLess: '\u2279',
				NotGreaterSlantEqual: '\u2A7E\u0338',
				NotGreaterTilde: '\u2275',
				NotHumpDownHump: '\u224E\u0338',
				NotHumpEqual: '\u224F\u0338',
				notin: '\u2209',
				notindot: '\u22F5\u0338',
				notinE: '\u22F9\u0338',
				notinva: '\u2209',
				notinvb: '\u22F7',
				notinvc: '\u22F6',
				NotLeftTriangle: '\u22EA',
				NotLeftTriangleBar: '\u29CF\u0338',
				NotLeftTriangleEqual: '\u22EC',
				NotLess: '\u226E',
				NotLessEqual: '\u2270',
				NotLessGreater: '\u2278',
				NotLessLess: '\u226A\u0338',
				NotLessSlantEqual: '\u2A7D\u0338',
				NotLessTilde: '\u2274',
				NotNestedGreaterGreater: '\u2AA2\u0338',
				NotNestedLessLess: '\u2AA1\u0338',
				notni: '\u220C',
				notniva: '\u220C',
				notnivb: '\u22FE',
				notnivc: '\u22FD',
				NotPrecedes: '\u2280',
				NotPrecedesEqual: '\u2AAF\u0338',
				NotPrecedesSlantEqual: '\u22E0',
				NotReverseElement: '\u220C',
				NotRightTriangle: '\u22EB',
				NotRightTriangleBar: '\u29D0\u0338',
				NotRightTriangleEqual: '\u22ED',
				NotSquareSubset: '\u228F\u0338',
				NotSquareSubsetEqual: '\u22E2',
				NotSquareSuperset: '\u2290\u0338',
				NotSquareSupersetEqual: '\u22E3',
				NotSubset: '\u2282\u20D2',
				NotSubsetEqual: '\u2288',
				NotSucceeds: '\u2281',
				NotSucceedsEqual: '\u2AB0\u0338',
				NotSucceedsSlantEqual: '\u22E1',
				NotSucceedsTilde: '\u227F\u0338',
				NotSuperset: '\u2283\u20D2',
				NotSupersetEqual: '\u2289',
				NotTilde: '\u2241',
				NotTildeEqual: '\u2244',
				NotTildeFullEqual: '\u2247',
				NotTildeTilde: '\u2249',
				NotVerticalBar: '\u2224',
				npar: '\u2226',
				nparallel: '\u2226',
				nparsl: '\u2AFD\u20E5',
				npart: '\u2202\u0338',
				npolint: '\u2A14',
				npr: '\u2280',
				nprcue: '\u22E0',
				npre: '\u2AAF\u0338',
				nprec: '\u2280',
				npreceq: '\u2AAF\u0338',
				nrArr: '\u21CF',
				nrarr: '\u219B',
				nrarrc: '\u2933\u0338',
				nrarrw: '\u219D\u0338',
				nRightarrow: '\u21CF',
				nrightarrow: '\u219B',
				nrtri: '\u22EB',
				nrtrie: '\u22ED',
				nsc: '\u2281',
				nsccue: '\u22E1',
				nsce: '\u2AB0\u0338',
				Nscr: '\uD835\uDCA9',
				nscr: '\uD835\uDCC3',
				nshortmid: '\u2224',
				nshortparallel: '\u2226',
				nsim: '\u2241',
				nsime: '\u2244',
				nsimeq: '\u2244',
				nsmid: '\u2224',
				nspar: '\u2226',
				nsqsube: '\u22E2',
				nsqsupe: '\u22E3',
				nsub: '\u2284',
				nsubE: '\u2AC5\u0338',
				nsube: '\u2288',
				nsubset: '\u2282\u20D2',
				nsubseteq: '\u2288',
				nsubseteqq: '\u2AC5\u0338',
				nsucc: '\u2281',
				nsucceq: '\u2AB0\u0338',
				nsup: '\u2285',
				nsupE: '\u2AC6\u0338',
				nsupe: '\u2289',
				nsupset: '\u2283\u20D2',
				nsupseteq: '\u2289',
				nsupseteqq: '\u2AC6\u0338',
				ntgl: '\u2279',
				Ntilde: '\u00D1',
				ntilde: '\u00F1',
				ntlg: '\u2278',
				ntriangleleft: '\u22EA',
				ntrianglelefteq: '\u22EC',
				ntriangleright: '\u22EB',
				ntrianglerighteq: '\u22ED',
				Nu: '\u039D',
				nu: '\u03BD',
				num: '\u0023',
				numero: '\u2116',
				numsp: '\u2007',
				nvap: '\u224D\u20D2',
				nVDash: '\u22AF',
				nVdash: '\u22AE',
				nvDash: '\u22AD',
				nvdash: '\u22AC',
				nvge: '\u2265\u20D2',
				nvgt: '\u003E\u20D2',
				nvHarr: '\u2904',
				nvinfin: '\u29DE',
				nvlArr: '\u2902',
				nvle: '\u2264\u20D2',
				nvlt: '\u003C\u20D2',
				nvltrie: '\u22B4\u20D2',
				nvrArr: '\u2903',
				nvrtrie: '\u22B5\u20D2',
				nvsim: '\u223C\u20D2',
				nwarhk: '\u2923',
				nwArr: '\u21D6',
				nwarr: '\u2196',
				nwarrow: '\u2196',
				nwnear: '\u2927',
				Oacute: '\u00D3',
				oacute: '\u00F3',
				oast: '\u229B',
				ocir: '\u229A',
				Ocirc: '\u00D4',
				ocirc: '\u00F4',
				Ocy: '\u041E',
				ocy: '\u043E',
				odash: '\u229D',
				Odblac: '\u0150',
				odblac: '\u0151',
				odiv: '\u2A38',
				odot: '\u2299',
				odsold: '\u29BC',
				OElig: '\u0152',
				oelig: '\u0153',
				ofcir: '\u29BF',
				Ofr: '\uD835\uDD12',
				ofr: '\uD835\uDD2C',
				ogon: '\u02DB',
				Ograve: '\u00D2',
				ograve: '\u00F2',
				ogt: '\u29C1',
				ohbar: '\u29B5',
				ohm: '\u03A9',
				oint: '\u222E',
				olarr: '\u21BA',
				olcir: '\u29BE',
				olcross: '\u29BB',
				oline: '\u203E',
				olt: '\u29C0',
				Omacr: '\u014C',
				omacr: '\u014D',
				Omega: '\u03A9',
				omega: '\u03C9',
				Omicron: '\u039F',
				omicron: '\u03BF',
				omid: '\u29B6',
				ominus: '\u2296',
				Oopf: '\uD835\uDD46',
				oopf: '\uD835\uDD60',
				opar: '\u29B7',
				OpenCurlyDoubleQuote: '\u201C',
				OpenCurlyQuote: '\u2018',
				operp: '\u29B9',
				oplus: '\u2295',
				Or: '\u2A54',
				or: '\u2228',
				orarr: '\u21BB',
				ord: '\u2A5D',
				order: '\u2134',
				orderof: '\u2134',
				ordf: '\u00AA',
				ordm: '\u00BA',
				origof: '\u22B6',
				oror: '\u2A56',
				orslope: '\u2A57',
				orv: '\u2A5B',
				oS: '\u24C8',
				Oscr: '\uD835\uDCAA',
				oscr: '\u2134',
				Oslash: '\u00D8',
				oslash: '\u00F8',
				osol: '\u2298',
				Otilde: '\u00D5',
				otilde: '\u00F5',
				Otimes: '\u2A37',
				otimes: '\u2297',
				otimesas: '\u2A36',
				Ouml: '\u00D6',
				ouml: '\u00F6',
				ovbar: '\u233D',
				OverBar: '\u203E',
				OverBrace: '\u23DE',
				OverBracket: '\u23B4',
				OverParenthesis: '\u23DC',
				par: '\u2225',
				para: '\u00B6',
				parallel: '\u2225',
				parsim: '\u2AF3',
				parsl: '\u2AFD',
				part: '\u2202',
				PartialD: '\u2202',
				Pcy: '\u041F',
				pcy: '\u043F',
				percnt: '\u0025',
				period: '\u002E',
				permil: '\u2030',
				perp: '\u22A5',
				pertenk: '\u2031',
				Pfr: '\uD835\uDD13',
				pfr: '\uD835\uDD2D',
				Phi: '\u03A6',
				phi: '\u03C6',
				phiv: '\u03D5',
				phmmat: '\u2133',
				phone: '\u260E',
				Pi: '\u03A0',
				pi: '\u03C0',
				pitchfork: '\u22D4',
				piv: '\u03D6',
				planck: '\u210F',
				planckh: '\u210E',
				plankv: '\u210F',
				plus: '\u002B',
				plusacir: '\u2A23',
				plusb: '\u229E',
				pluscir: '\u2A22',
				plusdo: '\u2214',
				plusdu: '\u2A25',
				pluse: '\u2A72',
				PlusMinus: '\u00B1',
				plusmn: '\u00B1',
				plussim: '\u2A26',
				plustwo: '\u2A27',
				pm: '\u00B1',
				Poincareplane: '\u210C',
				pointint: '\u2A15',
				Popf: '\u2119',
				popf: '\uD835\uDD61',
				pound: '\u00A3',
				Pr: '\u2ABB',
				pr: '\u227A',
				prap: '\u2AB7',
				prcue: '\u227C',
				prE: '\u2AB3',
				pre: '\u2AAF',
				prec: '\u227A',
				precapprox: '\u2AB7',
				preccurlyeq: '\u227C',
				Precedes: '\u227A',
				PrecedesEqual: '\u2AAF',
				PrecedesSlantEqual: '\u227C',
				PrecedesTilde: '\u227E',
				preceq: '\u2AAF',
				precnapprox: '\u2AB9',
				precneqq: '\u2AB5',
				precnsim: '\u22E8',
				precsim: '\u227E',
				Prime: '\u2033',
				prime: '\u2032',
				primes: '\u2119',
				prnap: '\u2AB9',
				prnE: '\u2AB5',
				prnsim: '\u22E8',
				prod: '\u220F',
				Product: '\u220F',
				profalar: '\u232E',
				profline: '\u2312',
				profsurf: '\u2313',
				prop: '\u221D',
				Proportion: '\u2237',
				Proportional: '\u221D',
				propto: '\u221D',
				prsim: '\u227E',
				prurel: '\u22B0',
				Pscr: '\uD835\uDCAB',
				pscr: '\uD835\uDCC5',
				Psi: '\u03A8',
				psi: '\u03C8',
				puncsp: '\u2008',
				Qfr: '\uD835\uDD14',
				qfr: '\uD835\uDD2E',
				qint: '\u2A0C',
				Qopf: '\u211A',
				qopf: '\uD835\uDD62',
				qprime: '\u2057',
				Qscr: '\uD835\uDCAC',
				qscr: '\uD835\uDCC6',
				quaternions: '\u210D',
				quatint: '\u2A16',
				quest: '\u003F',
				questeq: '\u225F',
				QUOT: '\u0022',
				quot: '\u0022',
				rAarr: '\u21DB',
				race: '\u223D\u0331',
				Racute: '\u0154',
				racute: '\u0155',
				radic: '\u221A',
				raemptyv: '\u29B3',
				Rang: '\u27EB',
				rang: '\u27E9',
				rangd: '\u2992',
				range: '\u29A5',
				rangle: '\u27E9',
				raquo: '\u00BB',
				Rarr: '\u21A0',
				rArr: '\u21D2',
				rarr: '\u2192',
				rarrap: '\u2975',
				rarrb: '\u21E5',
				rarrbfs: '\u2920',
				rarrc: '\u2933',
				rarrfs: '\u291E',
				rarrhk: '\u21AA',
				rarrlp: '\u21AC',
				rarrpl: '\u2945',
				rarrsim: '\u2974',
				Rarrtl: '\u2916',
				rarrtl: '\u21A3',
				rarrw: '\u219D',
				rAtail: '\u291C',
				ratail: '\u291A',
				ratio: '\u2236',
				rationals: '\u211A',
				RBarr: '\u2910',
				rBarr: '\u290F',
				rbarr: '\u290D',
				rbbrk: '\u2773',
				rbrace: '\u007D',
				rbrack: '\u005D',
				rbrke: '\u298C',
				rbrksld: '\u298E',
				rbrkslu: '\u2990',
				Rcaron: '\u0158',
				rcaron: '\u0159',
				Rcedil: '\u0156',
				rcedil: '\u0157',
				rceil: '\u2309',
				rcub: '\u007D',
				Rcy: '\u0420',
				rcy: '\u0440',
				rdca: '\u2937',
				rdldhar: '\u2969',
				rdquo: '\u201D',
				rdquor: '\u201D',
				rdsh: '\u21B3',
				Re: '\u211C',
				real: '\u211C',
				realine: '\u211B',
				realpart: '\u211C',
				reals: '\u211D',
				rect: '\u25AD',
				REG: '\u00AE',
				reg: '\u00AE',
				ReverseElement: '\u220B',
				ReverseEquilibrium: '\u21CB',
				ReverseUpEquilibrium: '\u296F',
				rfisht: '\u297D',
				rfloor: '\u230B',
				Rfr: '\u211C',
				rfr: '\uD835\uDD2F',
				rHar: '\u2964',
				rhard: '\u21C1',
				rharu: '\u21C0',
				rharul: '\u296C',
				Rho: '\u03A1',
				rho: '\u03C1',
				rhov: '\u03F1',
				RightAngleBracket: '\u27E9',
				RightArrow: '\u2192',
				Rightarrow: '\u21D2',
				rightarrow: '\u2192',
				RightArrowBar: '\u21E5',
				RightArrowLeftArrow: '\u21C4',
				rightarrowtail: '\u21A3',
				RightCeiling: '\u2309',
				RightDoubleBracket: '\u27E7',
				RightDownTeeVector: '\u295D',
				RightDownVector: '\u21C2',
				RightDownVectorBar: '\u2955',
				RightFloor: '\u230B',
				rightharpoondown: '\u21C1',
				rightharpoonup: '\u21C0',
				rightleftarrows: '\u21C4',
				rightleftharpoons: '\u21CC',
				rightrightarrows: '\u21C9',
				rightsquigarrow: '\u219D',
				RightTee: '\u22A2',
				RightTeeArrow: '\u21A6',
				RightTeeVector: '\u295B',
				rightthreetimes: '\u22CC',
				RightTriangle: '\u22B3',
				RightTriangleBar: '\u29D0',
				RightTriangleEqual: '\u22B5',
				RightUpDownVector: '\u294F',
				RightUpTeeVector: '\u295C',
				RightUpVector: '\u21BE',
				RightUpVectorBar: '\u2954',
				RightVector: '\u21C0',
				RightVectorBar: '\u2953',
				ring: '\u02DA',
				risingdotseq: '\u2253',
				rlarr: '\u21C4',
				rlhar: '\u21CC',
				rlm: '\u200F',
				rmoust: '\u23B1',
				rmoustache: '\u23B1',
				rnmid: '\u2AEE',
				roang: '\u27ED',
				roarr: '\u21FE',
				robrk: '\u27E7',
				ropar: '\u2986',
				Ropf: '\u211D',
				ropf: '\uD835\uDD63',
				roplus: '\u2A2E',
				rotimes: '\u2A35',
				RoundImplies: '\u2970',
				rpar: '\u0029',
				rpargt: '\u2994',
				rppolint: '\u2A12',
				rrarr: '\u21C9',
				Rrightarrow: '\u21DB',
				rsaquo: '\u203A',
				Rscr: '\u211B',
				rscr: '\uD835\uDCC7',
				Rsh: '\u21B1',
				rsh: '\u21B1',
				rsqb: '\u005D',
				rsquo: '\u2019',
				rsquor: '\u2019',
				rthree: '\u22CC',
				rtimes: '\u22CA',
				rtri: '\u25B9',
				rtrie: '\u22B5',
				rtrif: '\u25B8',
				rtriltri: '\u29CE',
				RuleDelayed: '\u29F4',
				ruluhar: '\u2968',
				rx: '\u211E',
				Sacute: '\u015A',
				sacute: '\u015B',
				sbquo: '\u201A',
				Sc: '\u2ABC',
				sc: '\u227B',
				scap: '\u2AB8',
				Scaron: '\u0160',
				scaron: '\u0161',
				sccue: '\u227D',
				scE: '\u2AB4',
				sce: '\u2AB0',
				Scedil: '\u015E',
				scedil: '\u015F',
				Scirc: '\u015C',
				scirc: '\u015D',
				scnap: '\u2ABA',
				scnE: '\u2AB6',
				scnsim: '\u22E9',
				scpolint: '\u2A13',
				scsim: '\u227F',
				Scy: '\u0421',
				scy: '\u0441',
				sdot: '\u22C5',
				sdotb: '\u22A1',
				sdote: '\u2A66',
				searhk: '\u2925',
				seArr: '\u21D8',
				searr: '\u2198',
				searrow: '\u2198',
				sect: '\u00A7',
				semi: '\u003B',
				seswar: '\u2929',
				setminus: '\u2216',
				setmn: '\u2216',
				sext: '\u2736',
				Sfr: '\uD835\uDD16',
				sfr: '\uD835\uDD30',
				sfrown: '\u2322',
				sharp: '\u266F',
				SHCHcy: '\u0429',
				shchcy: '\u0449',
				SHcy: '\u0428',
				shcy: '\u0448',
				ShortDownArrow: '\u2193',
				ShortLeftArrow: '\u2190',
				shortmid: '\u2223',
				shortparallel: '\u2225',
				ShortRightArrow: '\u2192',
				ShortUpArrow: '\u2191',
				shy: '\u00AD',
				Sigma: '\u03A3',
				sigma: '\u03C3',
				sigmaf: '\u03C2',
				sigmav: '\u03C2',
				sim: '\u223C',
				simdot: '\u2A6A',
				sime: '\u2243',
				simeq: '\u2243',
				simg: '\u2A9E',
				simgE: '\u2AA0',
				siml: '\u2A9D',
				simlE: '\u2A9F',
				simne: '\u2246',
				simplus: '\u2A24',
				simrarr: '\u2972',
				slarr: '\u2190',
				SmallCircle: '\u2218',
				smallsetminus: '\u2216',
				smashp: '\u2A33',
				smeparsl: '\u29E4',
				smid: '\u2223',
				smile: '\u2323',
				smt: '\u2AAA',
				smte: '\u2AAC',
				smtes: '\u2AAC\uFE00',
				SOFTcy: '\u042C',
				softcy: '\u044C',
				sol: '\u002F',
				solb: '\u29C4',
				solbar: '\u233F',
				Sopf: '\uD835\uDD4A',
				sopf: '\uD835\uDD64',
				spades: '\u2660',
				spadesuit: '\u2660',
				spar: '\u2225',
				sqcap: '\u2293',
				sqcaps: '\u2293\uFE00',
				sqcup: '\u2294',
				sqcups: '\u2294\uFE00',
				Sqrt: '\u221A',
				sqsub: '\u228F',
				sqsube: '\u2291',
				sqsubset: '\u228F',
				sqsubseteq: '\u2291',
				sqsup: '\u2290',
				sqsupe: '\u2292',
				sqsupset: '\u2290',
				sqsupseteq: '\u2292',
				squ: '\u25A1',
				Square: '\u25A1',
				square: '\u25A1',
				SquareIntersection: '\u2293',
				SquareSubset: '\u228F',
				SquareSubsetEqual: '\u2291',
				SquareSuperset: '\u2290',
				SquareSupersetEqual: '\u2292',
				SquareUnion: '\u2294',
				squarf: '\u25AA',
				squf: '\u25AA',
				srarr: '\u2192',
				Sscr: '\uD835\uDCAE',
				sscr: '\uD835\uDCC8',
				ssetmn: '\u2216',
				ssmile: '\u2323',
				sstarf: '\u22C6',
				Star: '\u22C6',
				star: '\u2606',
				starf: '\u2605',
				straightepsilon: '\u03F5',
				straightphi: '\u03D5',
				strns: '\u00AF',
				Sub: '\u22D0',
				sub: '\u2282',
				subdot: '\u2ABD',
				subE: '\u2AC5',
				sube: '\u2286',
				subedot: '\u2AC3',
				submult: '\u2AC1',
				subnE: '\u2ACB',
				subne: '\u228A',
				subplus: '\u2ABF',
				subrarr: '\u2979',
				Subset: '\u22D0',
				subset: '\u2282',
				subseteq: '\u2286',
				subseteqq: '\u2AC5',
				SubsetEqual: '\u2286',
				subsetneq: '\u228A',
				subsetneqq: '\u2ACB',
				subsim: '\u2AC7',
				subsub: '\u2AD5',
				subsup: '\u2AD3',
				succ: '\u227B',
				succapprox: '\u2AB8',
				succcurlyeq: '\u227D',
				Succeeds: '\u227B',
				SucceedsEqual: '\u2AB0',
				SucceedsSlantEqual: '\u227D',
				SucceedsTilde: '\u227F',
				succeq: '\u2AB0',
				succnapprox: '\u2ABA',
				succneqq: '\u2AB6',
				succnsim: '\u22E9',
				succsim: '\u227F',
				SuchThat: '\u220B',
				Sum: '\u2211',
				sum: '\u2211',
				sung: '\u266A',
				Sup: '\u22D1',
				sup: '\u2283',
				sup1: '\u00B9',
				sup2: '\u00B2',
				sup3: '\u00B3',
				supdot: '\u2ABE',
				supdsub: '\u2AD8',
				supE: '\u2AC6',
				supe: '\u2287',
				supedot: '\u2AC4',
				Superset: '\u2283',
				SupersetEqual: '\u2287',
				suphsol: '\u27C9',
				suphsub: '\u2AD7',
				suplarr: '\u297B',
				supmult: '\u2AC2',
				supnE: '\u2ACC',
				supne: '\u228B',
				supplus: '\u2AC0',
				Supset: '\u22D1',
				supset: '\u2283',
				supseteq: '\u2287',
				supseteqq: '\u2AC6',
				supsetneq: '\u228B',
				supsetneqq: '\u2ACC',
				supsim: '\u2AC8',
				supsub: '\u2AD4',
				supsup: '\u2AD6',
				swarhk: '\u2926',
				swArr: '\u21D9',
				swarr: '\u2199',
				swarrow: '\u2199',
				swnwar: '\u292A',
				szlig: '\u00DF',
				Tab: '\u0009',
				target: '\u2316',
				Tau: '\u03A4',
				tau: '\u03C4',
				tbrk: '\u23B4',
				Tcaron: '\u0164',
				tcaron: '\u0165',
				Tcedil: '\u0162',
				tcedil: '\u0163',
				Tcy: '\u0422',
				tcy: '\u0442',
				tdot: '\u20DB',
				telrec: '\u2315',
				Tfr: '\uD835\uDD17',
				tfr: '\uD835\uDD31',
				there4: '\u2234',
				Therefore: '\u2234',
				therefore: '\u2234',
				Theta: '\u0398',
				theta: '\u03B8',
				thetasym: '\u03D1',
				thetav: '\u03D1',
				thickapprox: '\u2248',
				thicksim: '\u223C',
				ThickSpace: '\u205F\u200A',
				thinsp: '\u2009',
				ThinSpace: '\u2009',
				thkap: '\u2248',
				thksim: '\u223C',
				THORN: '\u00DE',
				thorn: '\u00FE',
				Tilde: '\u223C',
				tilde: '\u02DC',
				TildeEqual: '\u2243',
				TildeFullEqual: '\u2245',
				TildeTilde: '\u2248',
				times: '\u00D7',
				timesb: '\u22A0',
				timesbar: '\u2A31',
				timesd: '\u2A30',
				tint: '\u222D',
				toea: '\u2928',
				top: '\u22A4',
				topbot: '\u2336',
				topcir: '\u2AF1',
				Topf: '\uD835\uDD4B',
				topf: '\uD835\uDD65',
				topfork: '\u2ADA',
				tosa: '\u2929',
				tprime: '\u2034',
				TRADE: '\u2122',
				trade: '\u2122',
				triangle: '\u25B5',
				triangledown: '\u25BF',
				triangleleft: '\u25C3',
				trianglelefteq: '\u22B4',
				triangleq: '\u225C',
				triangleright: '\u25B9',
				trianglerighteq: '\u22B5',
				tridot: '\u25EC',
				trie: '\u225C',
				triminus: '\u2A3A',
				TripleDot: '\u20DB',
				triplus: '\u2A39',
				trisb: '\u29CD',
				tritime: '\u2A3B',
				trpezium: '\u23E2',
				Tscr: '\uD835\uDCAF',
				tscr: '\uD835\uDCC9',
				TScy: '\u0426',
				tscy: '\u0446',
				TSHcy: '\u040B',
				tshcy: '\u045B',
				Tstrok: '\u0166',
				tstrok: '\u0167',
				twixt: '\u226C',
				twoheadleftarrow: '\u219E',
				twoheadrightarrow: '\u21A0',
				Uacute: '\u00DA',
				uacute: '\u00FA',
				Uarr: '\u219F',
				uArr: '\u21D1',
				uarr: '\u2191',
				Uarrocir: '\u2949',
				Ubrcy: '\u040E',
				ubrcy: '\u045E',
				Ubreve: '\u016C',
				ubreve: '\u016D',
				Ucirc: '\u00DB',
				ucirc: '\u00FB',
				Ucy: '\u0423',
				ucy: '\u0443',
				udarr: '\u21C5',
				Udblac: '\u0170',
				udblac: '\u0171',
				udhar: '\u296E',
				ufisht: '\u297E',
				Ufr: '\uD835\uDD18',
				ufr: '\uD835\uDD32',
				Ugrave: '\u00D9',
				ugrave: '\u00F9',
				uHar: '\u2963',
				uharl: '\u21BF',
				uharr: '\u21BE',
				uhblk: '\u2580',
				ulcorn: '\u231C',
				ulcorner: '\u231C',
				ulcrop: '\u230F',
				ultri: '\u25F8',
				Umacr: '\u016A',
				umacr: '\u016B',
				uml: '\u00A8',
				UnderBar: '\u005F',
				UnderBrace: '\u23DF',
				UnderBracket: '\u23B5',
				UnderParenthesis: '\u23DD',
				Union: '\u22C3',
				UnionPlus: '\u228E',
				Uogon: '\u0172',
				uogon: '\u0173',
				Uopf: '\uD835\uDD4C',
				uopf: '\uD835\uDD66',
				UpArrow: '\u2191',
				Uparrow: '\u21D1',
				uparrow: '\u2191',
				UpArrowBar: '\u2912',
				UpArrowDownArrow: '\u21C5',
				UpDownArrow: '\u2195',
				Updownarrow: '\u21D5',
				updownarrow: '\u2195',
				UpEquilibrium: '\u296E',
				upharpoonleft: '\u21BF',
				upharpoonright: '\u21BE',
				uplus: '\u228E',
				UpperLeftArrow: '\u2196',
				UpperRightArrow: '\u2197',
				Upsi: '\u03D2',
				upsi: '\u03C5',
				upsih: '\u03D2',
				Upsilon: '\u03A5',
				upsilon: '\u03C5',
				UpTee: '\u22A5',
				UpTeeArrow: '\u21A5',
				upuparrows: '\u21C8',
				urcorn: '\u231D',
				urcorner: '\u231D',
				urcrop: '\u230E',
				Uring: '\u016E',
				uring: '\u016F',
				urtri: '\u25F9',
				Uscr: '\uD835\uDCB0',
				uscr: '\uD835\uDCCA',
				utdot: '\u22F0',
				Utilde: '\u0168',
				utilde: '\u0169',
				utri: '\u25B5',
				utrif: '\u25B4',
				uuarr: '\u21C8',
				Uuml: '\u00DC',
				uuml: '\u00FC',
				uwangle: '\u29A7',
				vangrt: '\u299C',
				varepsilon: '\u03F5',
				varkappa: '\u03F0',
				varnothing: '\u2205',
				varphi: '\u03D5',
				varpi: '\u03D6',
				varpropto: '\u221D',
				vArr: '\u21D5',
				varr: '\u2195',
				varrho: '\u03F1',
				varsigma: '\u03C2',
				varsubsetneq: '\u228A\uFE00',
				varsubsetneqq: '\u2ACB\uFE00',
				varsupsetneq: '\u228B\uFE00',
				varsupsetneqq: '\u2ACC\uFE00',
				vartheta: '\u03D1',
				vartriangleleft: '\u22B2',
				vartriangleright: '\u22B3',
				Vbar: '\u2AEB',
				vBar: '\u2AE8',
				vBarv: '\u2AE9',
				Vcy: '\u0412',
				vcy: '\u0432',
				VDash: '\u22AB',
				Vdash: '\u22A9',
				vDash: '\u22A8',
				vdash: '\u22A2',
				Vdashl: '\u2AE6',
				Vee: '\u22C1',
				vee: '\u2228',
				veebar: '\u22BB',
				veeeq: '\u225A',
				vellip: '\u22EE',
				Verbar: '\u2016',
				verbar: '\u007C',
				Vert: '\u2016',
				vert: '\u007C',
				VerticalBar: '\u2223',
				VerticalLine: '\u007C',
				VerticalSeparator: '\u2758',
				VerticalTilde: '\u2240',
				VeryThinSpace: '\u200A',
				Vfr: '\uD835\uDD19',
				vfr: '\uD835\uDD33',
				vltri: '\u22B2',
				vnsub: '\u2282\u20D2',
				vnsup: '\u2283\u20D2',
				Vopf: '\uD835\uDD4D',
				vopf: '\uD835\uDD67',
				vprop: '\u221D',
				vrtri: '\u22B3',
				Vscr: '\uD835\uDCB1',
				vscr: '\uD835\uDCCB',
				vsubnE: '\u2ACB\uFE00',
				vsubne: '\u228A\uFE00',
				vsupnE: '\u2ACC\uFE00',
				vsupne: '\u228B\uFE00',
				Vvdash: '\u22AA',
				vzigzag: '\u299A',
				Wcirc: '\u0174',
				wcirc: '\u0175',
				wedbar: '\u2A5F',
				Wedge: '\u22C0',
				wedge: '\u2227',
				wedgeq: '\u2259',
				weierp: '\u2118',
				Wfr: '\uD835\uDD1A',
				wfr: '\uD835\uDD34',
				Wopf: '\uD835\uDD4E',
				wopf: '\uD835\uDD68',
				wp: '\u2118',
				wr: '\u2240',
				wreath: '\u2240',
				Wscr: '\uD835\uDCB2',
				wscr: '\uD835\uDCCC',
				xcap: '\u22C2',
				xcirc: '\u25EF',
				xcup: '\u22C3',
				xdtri: '\u25BD',
				Xfr: '\uD835\uDD1B',
				xfr: '\uD835\uDD35',
				xhArr: '\u27FA',
				xharr: '\u27F7',
				Xi: '\u039E',
				xi: '\u03BE',
				xlArr: '\u27F8',
				xlarr: '\u27F5',
				xmap: '\u27FC',
				xnis: '\u22FB',
				xodot: '\u2A00',
				Xopf: '\uD835\uDD4F',
				xopf: '\uD835\uDD69',
				xoplus: '\u2A01',
				xotime: '\u2A02',
				xrArr: '\u27F9',
				xrarr: '\u27F6',
				Xscr: '\uD835\uDCB3',
				xscr: '\uD835\uDCCD',
				xsqcup: '\u2A06',
				xuplus: '\u2A04',
				xutri: '\u25B3',
				xvee: '\u22C1',
				xwedge: '\u22C0',
				Yacute: '\u00DD',
				yacute: '\u00FD',
				YAcy: '\u042F',
				yacy: '\u044F',
				Ycirc: '\u0176',
				ycirc: '\u0177',
				Ycy: '\u042B',
				ycy: '\u044B',
				yen: '\u00A5',
				Yfr: '\uD835\uDD1C',
				yfr: '\uD835\uDD36',
				YIcy: '\u0407',
				yicy: '\u0457',
				Yopf: '\uD835\uDD50',
				yopf: '\uD835\uDD6A',
				Yscr: '\uD835\uDCB4',
				yscr: '\uD835\uDCCE',
				YUcy: '\u042E',
				yucy: '\u044E',
				Yuml: '\u0178',
				yuml: '\u00FF',
				Zacute: '\u0179',
				zacute: '\u017A',
				Zcaron: '\u017D',
				zcaron: '\u017E',
				Zcy: '\u0417',
				zcy: '\u0437',
				Zdot: '\u017B',
				zdot: '\u017C',
				zeetrf: '\u2128',
				ZeroWidthSpace: '\u200B',
				Zeta: '\u0396',
				zeta: '\u03B6',
				Zfr: '\u2128',
				zfr: '\uD835\uDD37',
				ZHcy: '\u0416',
				zhcy: '\u0436',
				zigrarr: '\u21DD',
				Zopf: '\u2124',
				zopf: '\uD835\uDD6B',
				Zscr: '\uD835\uDCB5',
				zscr: '\uD835\uDCCF',
				zwj: '\u200D',
				zwnj: '\u200C',
			});

			/**
			 * @deprecated use `HTML_ENTITIES` instead
			 * @see HTML_ENTITIES
			 */
			exports$1.entityMap = exports$1.HTML_ENTITIES; 
		} (entities));
		return entities;
	}

	var sax = {};

	var hasRequiredSax;

	function requireSax () {
		if (hasRequiredSax) return sax;
		hasRequiredSax = 1;
		var NAMESPACE = requireConventions().NAMESPACE;

		//[4]   	NameStartChar	   ::=   	":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
		//[4a]   	NameChar	   ::=   	NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
		//[5]   	Name	   ::=   	NameStartChar (NameChar)*
		var nameStartChar = /[A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;//\u10000-\uEFFFF
		var nameChar = new RegExp("[\\-\\.0-9"+nameStartChar.source.slice(1,-1)+"\\u00B7\\u0300-\\u036F\\u203F-\\u2040]");
		var tagNamePattern = new RegExp('^'+nameStartChar.source+nameChar.source+'*(?:\:'+nameStartChar.source+nameChar.source+'*)?$');
		//var tagNamePattern = /^[a-zA-Z_][\w\-\.]*(?:\:[a-zA-Z_][\w\-\.]*)?$/
		//var handlers = 'resolveEntity,getExternalSubset,characters,endDocument,endElement,endPrefixMapping,ignorableWhitespace,processingInstruction,setDocumentLocator,skippedEntity,startDocument,startElement,startPrefixMapping,notationDecl,unparsedEntityDecl,error,fatalError,warning,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,comment,endCDATA,endDTD,endEntity,startCDATA,startDTD,startEntity'.split(',')

		//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
		//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
		var S_TAG = 0;//tag name offerring
		var S_ATTR = 1;//attr name offerring
		var S_ATTR_SPACE=2;//attr name end and space offer
		var S_EQ = 3;//=space?
		var S_ATTR_NOQUOT_VALUE = 4;//attr value(no quot value only)
		var S_ATTR_END = 5;//attr value end and no space(quot end)
		var S_TAG_SPACE = 6;//(attr value end || tag end ) && (space offer)
		var S_TAG_CLOSE = 7;//closed el<el />

		/**
		 * Creates an error that will not be caught by XMLReader aka the SAX parser.
		 *
		 * @param {string} message
		 * @param {any?} locator Optional, can provide details about the location in the source
		 * @constructor
		 */
		function ParseError(message, locator) {
			this.message = message;
			this.locator = locator;
			if(Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
		}
		ParseError.prototype = new Error();
		ParseError.prototype.name = ParseError.name;

		function XMLReader(){

		}

		XMLReader.prototype = {
			parse:function(source,defaultNSMap,entityMap){
				var domBuilder = this.domBuilder;
				domBuilder.startDocument();
				_copy(defaultNSMap ,defaultNSMap = {});
				parse(source,defaultNSMap,entityMap,
						domBuilder,this.errorHandler);
				domBuilder.endDocument();
			}
		};
		function parse(source,defaultNSMapCopy,entityMap,domBuilder,errorHandler){
			function fixedFromCharCode(code) {
				// String.prototype.fromCharCode does not supports
				// > 2 bytes unicode chars directly
				if (code > 0xffff) {
					code -= 0x10000;
					var surrogate1 = 0xd800 + (code >> 10)
						, surrogate2 = 0xdc00 + (code & 0x3ff);

					return String.fromCharCode(surrogate1, surrogate2);
				} else {
					return String.fromCharCode(code);
				}
			}
			function entityReplacer(a){
				var k = a.slice(1,-1);
				if (Object.hasOwnProperty.call(entityMap, k)) {
					return entityMap[k];
				}else if(k.charAt(0) === '#'){
					return fixedFromCharCode(parseInt(k.substr(1).replace('x','0x')))
				}else {
					errorHandler.error('entity not found:'+a);
					return a;
				}
			}
			function appendText(end){//has some bugs
				if(end>start){
					var xt = source.substring(start,end).replace(/&#?\w+;/g,entityReplacer);
					locator&&position(start);
					domBuilder.characters(xt,0,end-start);
					start = end;
				}
			}
			function position(p,m){
				while(p>=lineEnd && (m = linePattern.exec(source))){
					lineStart = m.index;
					lineEnd = lineStart + m[0].length;
					locator.lineNumber++;
					//console.log('line++:',locator,startPos,endPos)
				}
				locator.columnNumber = p-lineStart+1;
			}
			var lineStart = 0;
			var lineEnd = 0;
			var linePattern = /.*(?:\r\n?|\n)|.*$/g;
			var locator = domBuilder.locator;

			var parseStack = [{currentNSMap:defaultNSMapCopy}];
			var closeMap = {};
			var start = 0;
			while(true){
				try{
					var tagStart = source.indexOf('<',start);
					if(tagStart<0){
						if(!source.substr(start).match(/^\s*$/)){
							var doc = domBuilder.doc;
			    			var text = doc.createTextNode(source.substr(start));
			    			doc.appendChild(text);
			    			domBuilder.currentElement = text;
						}
						return;
					}
					if(tagStart>start){
						appendText(tagStart);
					}
					switch(source.charAt(tagStart+1)){
					case '/':
						var end = source.indexOf('>',tagStart+3);
						var tagName = source.substring(tagStart + 2, end).replace(/[ \t\n\r]+$/g, '');
						var config = parseStack.pop();
						if(end<0){

			        		tagName = source.substring(tagStart+2).replace(/[\s<].*/,'');
			        		errorHandler.error("end tag name: "+tagName+' is not complete:'+config.tagName);
			        		end = tagStart+1+tagName.length;
			        	}else if(tagName.match(/\s</)){
			        		tagName = tagName.replace(/[\s<].*/,'');
			        		errorHandler.error("end tag name: "+tagName+' maybe not complete');
			        		end = tagStart+1+tagName.length;
						}
						var localNSMap = config.localNSMap;
						var endMatch = config.tagName == tagName;
						var endIgnoreCaseMach = endMatch || config.tagName&&config.tagName.toLowerCase() == tagName.toLowerCase();
				        if(endIgnoreCaseMach){
				        	domBuilder.endElement(config.uri,config.localName,tagName);
							if(localNSMap){
								for (var prefix in localNSMap) {
									if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
										domBuilder.endPrefixMapping(prefix);
									}
								}
							}
							if(!endMatch){
				            	errorHandler.fatalError("end tag name: "+tagName+' is not match the current start tagName:'+config.tagName ); // No known test case
							}
				        }else {
				        	parseStack.push(config);
				        }

						end++;
						break;
						// end elment
					case '?':// <?...?>
						locator&&position(tagStart);
						end = parseInstruction(source,tagStart,domBuilder);
						break;
					case '!':// <!doctype,<![CDATA,<!--
						locator&&position(tagStart);
						end = parseDCC(source,tagStart,domBuilder,errorHandler);
						break;
					default:
						locator&&position(tagStart);
						var el = new ElementAttributes();
						var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
						//elStartEnd
						var end = parseElementStartPart(source,tagStart,el,currentNSMap,entityReplacer,errorHandler);
						var len = el.length;


						if(!el.closed && fixSelfClosed(source,end,el.tagName,closeMap)){
							el.closed = true;
							if(!entityMap.nbsp){
								errorHandler.warning('unclosed xml attribute');
							}
						}
						if(locator && len){
							var locator2 = copyLocator(locator,{});
							//try{//attribute position fixed
							for(var i = 0;i<len;i++){
								var a = el[i];
								position(a.offset);
								a.locator = copyLocator(locator,{});
							}
							domBuilder.locator = locator2;
							if(appendElement(el,domBuilder,currentNSMap)){
								parseStack.push(el);
							}
							domBuilder.locator = locator;
						}else {
							if(appendElement(el,domBuilder,currentNSMap)){
								parseStack.push(el);
							}
						}

						if (NAMESPACE.isHTML(el.uri) && !el.closed) {
							end = parseHtmlSpecialContent(source,end,el.tagName,entityReplacer,domBuilder);
						} else {
							end++;
						}
					}
				}catch(e){
					if (e instanceof ParseError) {
						throw e;
					}
					errorHandler.error('element parse error: '+e);
					end = -1;
				}
				if(end>start){
					start = end;
				}else {
					//TODO: 这里有可能sax回退，有位置错误风险
					appendText(Math.max(tagStart,start)+1);
				}
			}
		}
		function copyLocator(f,t){
			t.lineNumber = f.lineNumber;
			t.columnNumber = f.columnNumber;
			return t;
		}

		/**
		 * @see #appendElement(source,elStartEnd,el,selfClosed,entityReplacer,domBuilder,parseStack);
		 * @return end of the elementStartPart(end of elementEndPart for selfClosed el)
		 */
		function parseElementStartPart(source,start,el,currentNSMap,entityReplacer,errorHandler){

			/**
			 * @param {string} qname
			 * @param {string} value
			 * @param {number} startIndex
			 */
			function addAttribute(qname, value, startIndex) {
				if (el.attributeNames.hasOwnProperty(qname)) {
					errorHandler.fatalError('Attribute ' + qname + ' redefined');
				}
				el.addValue(
					qname,
					// @see https://www.w3.org/TR/xml/#AVNormalize
					// since the xmldom sax parser does not "interpret" DTD the following is not implemented:
					// - recursive replacement of (DTD) entity references
					// - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
					value.replace(/[\t\n\r]/g, ' ').replace(/&#?\w+;/g, entityReplacer),
					startIndex
				);
			}
			var attrName;
			var value;
			var p = ++start;
			var s = S_TAG;//status
			while(true){
				var c = source.charAt(p);
				switch(c){
				case '=':
					if(s === S_ATTR){//attrName
						attrName = source.slice(start,p);
						s = S_EQ;
					}else if(s === S_ATTR_SPACE){
						s = S_EQ;
					}else {
						//fatalError: equal must after attrName or space after attrName
						throw new Error('attribute equal must after attrName'); // No known test case
					}
					break;
				case '\'':
				case '"':
					if(s === S_EQ || s === S_ATTR //|| s == S_ATTR_SPACE
						){//equal
						if(s === S_ATTR){
							errorHandler.warning('attribute value must after "="');
							attrName = source.slice(start,p);
						}
						start = p+1;
						p = source.indexOf(c,start);
						if(p>0){
							value = source.slice(start, p);
							addAttribute(attrName, value, start-1);
							s = S_ATTR_END;
						}else {
							//fatalError: no end quot match
							throw new Error('attribute value no end \''+c+'\' match');
						}
					}else if(s == S_ATTR_NOQUOT_VALUE){
						value = source.slice(start, p);
						addAttribute(attrName, value, start);
						errorHandler.warning('attribute "'+attrName+'" missed start quot('+c+')!!');
						start = p+1;
						s = S_ATTR_END;
					}else {
						//fatalError: no equal before
						throw new Error('attribute value must after "="'); // No known test case
					}
					break;
				case '/':
					switch(s){
					case S_TAG:
						el.setTagName(source.slice(start,p));
					case S_ATTR_END:
					case S_TAG_SPACE:
					case S_TAG_CLOSE:
						s =S_TAG_CLOSE;
						el.closed = true;
					case S_ATTR_NOQUOT_VALUE:
					case S_ATTR:
						break;
						case S_ATTR_SPACE:
							el.closed = true;
						break;
					//case S_EQ:
					default:
						throw new Error("attribute invalid close char('/')") // No known test case
					}
					break;
				case ''://end document
					errorHandler.error('unexpected end of input');
					if(s == S_TAG){
						el.setTagName(source.slice(start,p));
					}
					return p;
				case '>':
					switch(s){
					case S_TAG:
						el.setTagName(source.slice(start,p));
					case S_ATTR_END:
					case S_TAG_SPACE:
					case S_TAG_CLOSE:
						break;//normal
					case S_ATTR_NOQUOT_VALUE://Compatible state
					case S_ATTR:
						value = source.slice(start,p);
						if(value.slice(-1) === '/'){
							el.closed  = true;
							value = value.slice(0,-1);
						}
					case S_ATTR_SPACE:
						if(s === S_ATTR_SPACE){
							value = attrName;
						}
						if(s == S_ATTR_NOQUOT_VALUE){
							errorHandler.warning('attribute "'+value+'" missed quot(")!');
							addAttribute(attrName, value, start);
						}else {
							if(!NAMESPACE.isHTML(currentNSMap['']) || !value.match(/^(?:disabled|checked|selected)$/i)){
								errorHandler.warning('attribute "'+value+'" missed value!! "'+value+'" instead!!');
							}
							addAttribute(value, value, start);
						}
						break;
					case S_EQ:
						throw new Error('attribute value missed!!');
					}
		//			console.log(tagName,tagNamePattern,tagNamePattern.test(tagName))
					return p;
				/*xml space '\x20' | #x9 | #xD | #xA; */
				case '\u0080':
					c = ' ';
				default:
					if(c<= ' '){//space
						switch(s){
						case S_TAG:
							el.setTagName(source.slice(start,p));//tagName
							s = S_TAG_SPACE;
							break;
						case S_ATTR:
							attrName = source.slice(start,p);
							s = S_ATTR_SPACE;
							break;
						case S_ATTR_NOQUOT_VALUE:
							var value = source.slice(start, p);
							errorHandler.warning('attribute "'+value+'" missed quot(")!!');
							addAttribute(attrName, value, start);
						case S_ATTR_END:
							s = S_TAG_SPACE;
							break;
						//case S_TAG_SPACE:
						//case S_EQ:
						//case S_ATTR_SPACE:
						//	void();break;
						//case S_TAG_CLOSE:
							//ignore warning
						}
					}else {//not space
		//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
		//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
						switch(s){
						//case S_TAG:void();break;
						//case S_ATTR:void();break;
						//case S_ATTR_NOQUOT_VALUE:void();break;
						case S_ATTR_SPACE:
							el.tagName;
							if (!NAMESPACE.isHTML(currentNSMap['']) || !attrName.match(/^(?:disabled|checked|selected)$/i)) {
								errorHandler.warning('attribute "'+attrName+'" missed value!! "'+attrName+'" instead2!!');
							}
							addAttribute(attrName, attrName, start);
							start = p;
							s = S_ATTR;
							break;
						case S_ATTR_END:
							errorHandler.warning('attribute space is required"'+attrName+'"!!');
						case S_TAG_SPACE:
							s = S_ATTR;
							start = p;
							break;
						case S_EQ:
							s = S_ATTR_NOQUOT_VALUE;
							start = p;
							break;
						case S_TAG_CLOSE:
							throw new Error("elements closed character '/' and '>' must be connected to");
						}
					}
				}//end outer switch
				//console.log('p++',p)
				p++;
			}
		}
		/**
		 * @return true if has new namespace define
		 */
		function appendElement(el,domBuilder,currentNSMap){
			var tagName = el.tagName;
			var localNSMap = null;
			//var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
			var i = el.length;
			while(i--){
				var a = el[i];
				var qName = a.qName;
				var value = a.value;
				var nsp = qName.indexOf(':');
				if(nsp>0){
					var prefix = a.prefix = qName.slice(0,nsp);
					var localName = qName.slice(nsp+1);
					var nsPrefix = prefix === 'xmlns' && localName;
				}else {
					localName = qName;
					prefix = null;
					nsPrefix = qName === 'xmlns' && '';
				}
				//can not set prefix,because prefix !== ''
				a.localName = localName ;
				//prefix == null for no ns prefix attribute
				if(nsPrefix !== false){//hack!!
					if(localNSMap == null){
						localNSMap = {};
						//console.log(currentNSMap,0)
						_copy(currentNSMap,currentNSMap={});
						//console.log(currentNSMap,1)
					}
					currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
					a.uri = NAMESPACE.XMLNS;
					domBuilder.startPrefixMapping(nsPrefix, value);
				}
			}
			var i = el.length;
			while(i--){
				a = el[i];
				var prefix = a.prefix;
				if(prefix){//no prefix attribute has no namespace
					if(prefix === 'xml'){
						a.uri = NAMESPACE.XML;
					}if(prefix !== 'xmlns'){
						a.uri = currentNSMap[prefix || ''];

						//{console.log('###'+a.qName,domBuilder.locator.systemId+'',currentNSMap,a.uri)}
					}
				}
			}
			var nsp = tagName.indexOf(':');
			if(nsp>0){
				prefix = el.prefix = tagName.slice(0,nsp);
				localName = el.localName = tagName.slice(nsp+1);
			}else {
				prefix = null;//important!!
				localName = el.localName = tagName;
			}
			//no prefix element has default namespace
			var ns = el.uri = currentNSMap[prefix || ''];
			domBuilder.startElement(ns,localName,tagName,el);
			//endPrefixMapping and startPrefixMapping have not any help for dom builder
			//localNSMap = null
			if(el.closed){
				domBuilder.endElement(ns,localName,tagName);
				if(localNSMap){
					for (prefix in localNSMap) {
						if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
							domBuilder.endPrefixMapping(prefix);
						}
					}
				}
			}else {
				el.currentNSMap = currentNSMap;
				el.localNSMap = localNSMap;
				//parseStack.push(el);
				return true;
			}
		}
		function parseHtmlSpecialContent(source,elStartEnd,tagName,entityReplacer,domBuilder){
			if(/^(?:script|textarea)$/i.test(tagName)){
				var elEndStart =  source.indexOf('</'+tagName+'>',elStartEnd);
				var text = source.substring(elStartEnd+1,elEndStart);
				if(/[&<]/.test(text)){
					if(/^script$/i.test(tagName)){
						//if(!/\]\]>/.test(text)){
							//lexHandler.startCDATA();
							domBuilder.characters(text,0,text.length);
							//lexHandler.endCDATA();
							return elEndStart;
						//}
					}//}else{//text area
						text = text.replace(/&#?\w+;/g,entityReplacer);
						domBuilder.characters(text,0,text.length);
						return elEndStart;
					//}

				}
			}
			return elStartEnd+1;
		}
		function fixSelfClosed(source,elStartEnd,tagName,closeMap){
			//if(tagName in closeMap){
			var pos = closeMap[tagName];
			if(pos == null){
				//console.log(tagName)
				pos =  source.lastIndexOf('</'+tagName+'>');
				if(pos<elStartEnd){//忘记闭合
					pos = source.lastIndexOf('</'+tagName);
				}
				closeMap[tagName] =pos;
			}
			return pos<elStartEnd;
			//}
		}

		function _copy (source, target) {
			for (var n in source) {
				if (Object.prototype.hasOwnProperty.call(source, n)) {
					target[n] = source[n];
				}
			}
		}

		function parseDCC(source,start,domBuilder,errorHandler){//sure start with '<!'
			var next= source.charAt(start+2);
			switch(next){
			case '-':
				if(source.charAt(start + 3) === '-'){
					var end = source.indexOf('-->',start+4);
					//append comment source.substring(4,end)//<!--
					if(end>start){
						domBuilder.comment(source,start+4,end-start-4);
						return end+3;
					}else {
						errorHandler.error("Unclosed comment");
						return -1;
					}
				}else {
					//error
					return -1;
				}
			default:
				if(source.substr(start+3,6) == 'CDATA['){
					var end = source.indexOf(']]>',start+9);
					domBuilder.startCDATA();
					domBuilder.characters(source,start+9,end-start-9);
					domBuilder.endCDATA();
					return end+3;
				}
				//<!DOCTYPE
				//startDTD(java.lang.String name, java.lang.String publicId, java.lang.String systemId)
				var matchs = split(source,start);
				var len = matchs.length;
				if(len>1 && /!doctype/i.test(matchs[0][0])){
					var name = matchs[1][0];
					var pubid = false;
					var sysid = false;
					if(len>3){
						if(/^public$/i.test(matchs[2][0])){
							pubid = matchs[3][0];
							sysid = len>4 && matchs[4][0];
						}else if(/^system$/i.test(matchs[2][0])){
							sysid = matchs[3][0];
						}
					}
					var lastMatch = matchs[len-1];
					domBuilder.startDTD(name, pubid, sysid);
					domBuilder.endDTD();

					return lastMatch.index+lastMatch[0].length
				}
			}
			return -1;
		}



		function parseInstruction(source,start,domBuilder){
			var end = source.indexOf('?>',start);
			if(end){
				var match = source.substring(start,end).match(/^<\?(\S*)\s*([\s\S]*?)\s*$/);
				if(match){
					match[0].length;
					domBuilder.processingInstruction(match[1], match[2]) ;
					return end+2;
				}else {//error
					return -1;
				}
			}
			return -1;
		}

		function ElementAttributes(){
			this.attributeNames = {};
		}
		ElementAttributes.prototype = {
			setTagName:function(tagName){
				if(!tagNamePattern.test(tagName)){
					throw new Error('invalid tagName:'+tagName)
				}
				this.tagName = tagName;
			},
			addValue:function(qName, value, offset) {
				if(!tagNamePattern.test(qName)){
					throw new Error('invalid attribute:'+qName)
				}
				this.attributeNames[qName] = this.length;
				this[this.length++] = {qName:qName,value:value,offset:offset};
			},
			length:0,
			getLocalName:function(i){return this[i].localName},
			getLocator:function(i){return this[i].locator},
			getQName:function(i){return this[i].qName},
			getURI:function(i){return this[i].uri},
			getValue:function(i){return this[i].value}
		//	,getIndex:function(uri, localName)){
		//		if(localName){
		//
		//		}else{
		//			var qName = uri
		//		}
		//	},
		//	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
		//	getType:function(uri,localName){}
		//	getType:function(i){},
		};



		function split(source,start){
			var match;
			var buf = [];
			var reg = /'[^']+'|"[^"]+"|[^\s<>\/=]+=?|(\/?\s*>|<)/g;
			reg.lastIndex = start;
			reg.exec(source);//skip <
			while(match = reg.exec(source)){
				buf.push(match);
				if(match[1])return buf;
			}
		}

		sax.XMLReader = XMLReader;
		sax.ParseError = ParseError;
		return sax;
	}

	var hasRequiredDomParser;

	function requireDomParser () {
		if (hasRequiredDomParser) return domParser;
		hasRequiredDomParser = 1;
		var conventions = requireConventions();
		var dom = requireDom();
		var entities = requireEntities();
		var sax = requireSax();

		var DOMImplementation = dom.DOMImplementation;

		var NAMESPACE = conventions.NAMESPACE;

		var ParseError = sax.ParseError;
		var XMLReader = sax.XMLReader;

		/**
		 * Normalizes line ending according to https://www.w3.org/TR/xml11/#sec-line-ends:
		 *
		 * > XML parsed entities are often stored in computer files which,
		 * > for editing convenience, are organized into lines.
		 * > These lines are typically separated by some combination
		 * > of the characters CARRIAGE RETURN (#xD) and LINE FEED (#xA).
		 * >
		 * > To simplify the tasks of applications, the XML processor must behave
		 * > as if it normalized all line breaks in external parsed entities (including the document entity)
		 * > on input, before parsing, by translating all of the following to a single #xA character:
		 * >
		 * > 1. the two-character sequence #xD #xA
		 * > 2. the two-character sequence #xD #x85
		 * > 3. the single character #x85
		 * > 4. the single character #x2028
		 * > 5. any #xD character that is not immediately followed by #xA or #x85.
		 *
		 * @param {string} input
		 * @returns {string}
		 */
		function normalizeLineEndings(input) {
			return input
				.replace(/\r[\n\u0085]/g, '\n')
				.replace(/[\r\u0085\u2028]/g, '\n')
		}

		/**
		 * @typedef Locator
		 * @property {number} [columnNumber]
		 * @property {number} [lineNumber]
		 */

		/**
		 * @typedef DOMParserOptions
		 * @property {DOMHandler} [domBuilder]
		 * @property {Function} [errorHandler]
		 * @property {(string) => string} [normalizeLineEndings] used to replace line endings before parsing
		 * 						defaults to `normalizeLineEndings`
		 * @property {Locator} [locator]
		 * @property {Record<string, string>} [xmlns]
		 *
		 * @see normalizeLineEndings
		 */

		/**
		 * The DOMParser interface provides the ability to parse XML or HTML source code
		 * from a string into a DOM `Document`.
		 *
		 * _xmldom is different from the spec in that it allows an `options` parameter,
		 * to override the default behavior._
		 *
		 * @param {DOMParserOptions} [options]
		 * @constructor
		 *
		 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
		 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-parsing-and-serialization
		 */
		function DOMParser(options){
			this.options = options ||{locator:{}};
		}

		DOMParser.prototype.parseFromString = function(source,mimeType){
			var options = this.options;
			var sax =  new XMLReader();
			var domBuilder = options.domBuilder || new DOMHandler();//contentHandler and LexicalHandler
			var errorHandler = options.errorHandler;
			var locator = options.locator;
			var defaultNSMap = options.xmlns||{};
			var isHTML = /\/x?html?$/.test(mimeType);//mimeType.toLowerCase().indexOf('html') > -1;
		  	var entityMap = isHTML ? entities.HTML_ENTITIES : entities.XML_ENTITIES;
			if(locator){
				domBuilder.setDocumentLocator(locator);
			}

			sax.errorHandler = buildErrorHandler(errorHandler,domBuilder,locator);
			sax.domBuilder = options.domBuilder || domBuilder;
			if(isHTML){
				defaultNSMap[''] = NAMESPACE.HTML;
			}
			defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
			var normalize = options.normalizeLineEndings || normalizeLineEndings;
			if (source && typeof source === 'string') {
				sax.parse(
					normalize(source),
					defaultNSMap,
					entityMap
				);
			} else {
				sax.errorHandler.error('invalid doc source');
			}
			return domBuilder.doc;
		};
		function buildErrorHandler(errorImpl,domBuilder,locator){
			if(!errorImpl){
				if(domBuilder instanceof DOMHandler){
					return domBuilder;
				}
				errorImpl = domBuilder ;
			}
			var errorHandler = {};
			var isCallback = errorImpl instanceof Function;
			locator = locator||{};
			function build(key){
				var fn = errorImpl[key];
				if(!fn && isCallback){
					fn = errorImpl.length == 2?function(msg){errorImpl(key,msg);}:errorImpl;
				}
				errorHandler[key] = fn && function(msg){
					fn('[xmldom '+key+']\t'+msg+_locator(locator));
				}||function(){};
			}
			build('warning');
			build('error');
			build('fatalError');
			return errorHandler;
		}

		//console.log('#\n\n\n\n\n\n\n####')
		/**
		 * +ContentHandler+ErrorHandler
		 * +LexicalHandler+EntityResolver2
		 * -DeclHandler-DTDHandler
		 *
		 * DefaultHandler:EntityResolver, DTDHandler, ContentHandler, ErrorHandler
		 * DefaultHandler2:DefaultHandler,LexicalHandler, DeclHandler, EntityResolver2
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/helpers/DefaultHandler.html
		 */
		function DOMHandler() {
		    this.cdata = false;
		}
		function position(locator,node){
			node.lineNumber = locator.lineNumber;
			node.columnNumber = locator.columnNumber;
		}
		/**
		 * @see org.xml.sax.ContentHandler#startDocument
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
		 */
		DOMHandler.prototype = {
			startDocument : function() {
		    	this.doc = new DOMImplementation().createDocument(null, null, null);
		    	if (this.locator) {
		        	this.doc.documentURI = this.locator.systemId;
		    	}
			},
			startElement:function(namespaceURI, localName, qName, attrs) {
				var doc = this.doc;
			    var el = doc.createElementNS(namespaceURI, qName||localName);
			    var len = attrs.length;
			    appendElement(this, el);
			    this.currentElement = el;

				this.locator && position(this.locator,el);
			    for (var i = 0 ; i < len; i++) {
			        var namespaceURI = attrs.getURI(i);
			        var value = attrs.getValue(i);
			        var qName = attrs.getQName(i);
					var attr = doc.createAttributeNS(namespaceURI, qName);
					this.locator &&position(attrs.getLocator(i),attr);
					attr.value = attr.nodeValue = value;
					el.setAttributeNode(attr);
			    }
			},
			endElement:function(namespaceURI, localName, qName) {
				var current = this.currentElement;
				current.tagName;
				this.currentElement = current.parentNode;
			},
			startPrefixMapping:function(prefix, uri) {
			},
			endPrefixMapping:function(prefix) {
			},
			processingInstruction:function(target, data) {
			    var ins = this.doc.createProcessingInstruction(target, data);
			    this.locator && position(this.locator,ins);
			    appendElement(this, ins);
			},
			ignorableWhitespace:function(ch, start, length) {
			},
			characters:function(chars, start, length) {
				chars = _toString.apply(this,arguments);
				//console.log(chars)
				if(chars){
					if (this.cdata) {
						var charNode = this.doc.createCDATASection(chars);
					} else {
						var charNode = this.doc.createTextNode(chars);
					}
					if(this.currentElement){
						this.currentElement.appendChild(charNode);
					}else if(/^\s*$/.test(chars)){
						this.doc.appendChild(charNode);
						//process xml
					}
					this.locator && position(this.locator,charNode);
				}
			},
			skippedEntity:function(name) {
			},
			endDocument:function() {
				this.doc.normalize();
			},
			setDocumentLocator:function (locator) {
			    if(this.locator = locator){// && !('lineNumber' in locator)){
			    	locator.lineNumber = 0;
			    }
			},
			//LexicalHandler
			comment:function(chars, start, length) {
				chars = _toString.apply(this,arguments);
			    var comm = this.doc.createComment(chars);
			    this.locator && position(this.locator,comm);
			    appendElement(this, comm);
			},

			startCDATA:function() {
			    //used in characters() methods
			    this.cdata = true;
			},
			endCDATA:function() {
			    this.cdata = false;
			},

			startDTD:function(name, publicId, systemId) {
				var impl = this.doc.implementation;
			    if (impl && impl.createDocumentType) {
			        var dt = impl.createDocumentType(name, publicId, systemId);
			        this.locator && position(this.locator,dt);
			        appendElement(this, dt);
							this.doc.doctype = dt;
			    }
			},
			/**
			 * @see org.xml.sax.ErrorHandler
			 * @link http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
			 */
			warning:function(error) {
				console.warn('[xmldom warning]\t'+error,_locator(this.locator));
			},
			error:function(error) {
				console.error('[xmldom error]\t'+error,_locator(this.locator));
			},
			fatalError:function(error) {
				throw new ParseError(error, this.locator);
			}
		};
		function _locator(l){
			if(l){
				return '\n@'+(l.systemId ||'')+'#[line:'+l.lineNumber+',col:'+l.columnNumber+']'
			}
		}
		function _toString(chars,start,length){
			if(typeof chars == 'string'){
				return chars.substr(start,length)
			}else {//java sax connect width xmldom on rhino(what about: "? && !(chars instanceof String)")
				if(chars.length >= start+length || start){
					return new java.lang.String(chars,start,length)+'';
				}
				return chars;
			}
		}

		/*
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/LexicalHandler.html
		 * used method of org.xml.sax.ext.LexicalHandler:
		 *  #comment(chars, start, length)
		 *  #startCDATA()
		 *  #endCDATA()
		 *  #startDTD(name, publicId, systemId)
		 *
		 *
		 * IGNORED method of org.xml.sax.ext.LexicalHandler:
		 *  #endDTD()
		 *  #startEntity(name)
		 *  #endEntity(name)
		 *
		 *
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/DeclHandler.html
		 * IGNORED method of org.xml.sax.ext.DeclHandler
		 * 	#attributeDecl(eName, aName, type, mode, value)
		 *  #elementDecl(name, model)
		 *  #externalEntityDecl(name, publicId, systemId)
		 *  #internalEntityDecl(name, value)
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/EntityResolver2.html
		 * IGNORED method of org.xml.sax.EntityResolver2
		 *  #resolveEntity(String name,String publicId,String baseURI,String systemId)
		 *  #resolveEntity(publicId, systemId)
		 *  #getExternalSubset(name, baseURI)
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/DTDHandler.html
		 * IGNORED method of org.xml.sax.DTDHandler
		 *  #notationDecl(name, publicId, systemId) {};
		 *  #unparsedEntityDecl(name, publicId, systemId, notationName) {};
		 */
		"endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(/\w+/g,function(key){
			DOMHandler.prototype[key] = function(){return null};
		});

		/* Private static helpers treated below as private instance methods, so don't need to add these to the public API; we might use a Relator to also get rid of non-standard public properties */
		function appendElement (hander,node) {
		    if (!hander.currentElement) {
		        hander.doc.appendChild(node);
		    } else {
		        hander.currentElement.appendChild(node);
		    }
		}//appendChild and setAttributeNS are preformance key

		domParser.__DOMHandler = DOMHandler;
		domParser.normalizeLineEndings = normalizeLineEndings;
		domParser.DOMParser = DOMParser;
		return domParser;
	}

	var hasRequiredLib$1;

	function requireLib$1 () {
		if (hasRequiredLib$1) return lib$1;
		hasRequiredLib$1 = 1;
		var dom = requireDom();
		lib$1.DOMImplementation = dom.DOMImplementation;
		lib$1.XMLSerializer = dom.XMLSerializer;
		lib$1.DOMParser = requireDomParser().DOMParser;
		return lib$1;
	}

	/**
	 * Module dependencies.
	 */

	var hasRequiredParse;

	function requireParse () {
		if (hasRequiredParse) return parse;
		hasRequiredParse = 1;
		const { DOMParser } = requireLib$1();

		/**
		 * Module exports.
		 */

		parse.parse = parse$1;

		var TEXT_NODE = 3;
		var CDATA_NODE = 4;
		var COMMENT_NODE = 8;


		/**
		 * We ignore raw text (usually whitespace), <!-- xml comments -->,
		 * and raw CDATA nodes.
		 *
		 * @param {Element} node
		 * @returns {Boolean}
		 * @api private
		 */

		function shouldIgnoreNode (node) {
		  return node.nodeType === TEXT_NODE
		    || node.nodeType === COMMENT_NODE
		    || node.nodeType === CDATA_NODE;
		}

		/**
		 * Check if the node is empty. Some plist file has such node:
		 * <key />
		 * this node shoud be ignored.
		 *
		 * @see https://github.com/TooTallNate/plist.js/issues/66
		 * @param {Element} node
		 * @returns {Boolean}
		 * @api private
		 */
		function isEmptyNode(node){
		  if(!node.childNodes || node.childNodes.length === 0) {
		    return true;
		  } else {
		    return false;
		  }
		}

		function invariant(test, message) {
		  if (!test) {
		    throw new Error(message);
		  }
		}

		/**
		 * Parses a Plist XML string. Returns an Object.
		 *
		 * @param {String} xml - the XML String to decode
		 * @returns {Mixed} the decoded value from the Plist XML
		 * @api public
		 */

		function parse$1 (xml) {
		  var doc = new DOMParser().parseFromString(xml);
		  invariant(
		    doc.documentElement.nodeName === 'plist',
		    'malformed document. First element should be <plist>'
		  );
		  var plist = parsePlistXML(doc.documentElement);

		  // the root <plist> node gets interpreted as an Array,
		  // so pull out the inner data first
		  if (plist.length == 1) plist = plist[0];

		  return plist;
		}

		/**
		 * Convert an XML based plist document into a JSON representation.
		 *
		 * @param {Object} xml_node - current XML node in the plist
		 * @returns {Mixed} built up JSON object
		 * @api private
		 */

		function parsePlistXML (node) {
		  var i, new_obj, key, new_arr, res, counter, type;

		  if (!node)
		    return null;

		  if (node.nodeName === 'plist') {
		    new_arr = [];
		    if (isEmptyNode(node)) {
		      return new_arr;
		    }
		    for (i=0; i < node.childNodes.length; i++) {
		      if (!shouldIgnoreNode(node.childNodes[i])) {
		        new_arr.push( parsePlistXML(node.childNodes[i]));
		      }
		    }
		    return new_arr;
		  } else if (node.nodeName === 'dict') {
		    new_obj = {};
		    key = null;
		    counter = 0;
		    if (isEmptyNode(node)) {
		      return new_obj;
		    }
		    for (i=0; i < node.childNodes.length; i++) {
		      if (shouldIgnoreNode(node.childNodes[i])) continue;
		      if (counter % 2 === 0) {
		        invariant(
		          node.childNodes[i].nodeName === 'key',
		          'Missing key while parsing <dict/>.'
		        );
		        key = parsePlistXML(node.childNodes[i]);
		      } else {
		        invariant(
		          node.childNodes[i].nodeName !== 'key',
		          'Unexpected key "'
		            + parsePlistXML(node.childNodes[i])
		            + '" while parsing <dict/>.'
		        );
		        new_obj[key] = parsePlistXML(node.childNodes[i]);
		      }
		      counter += 1;
		    }
		    if (counter % 2 === 1) {
		      new_obj[key] = '';
		    }
		    
		    return new_obj;

		  } else if (node.nodeName === 'array') {
		    new_arr = [];
		    if (isEmptyNode(node)) {
		      return new_arr;
		    }
		    for (i=0; i < node.childNodes.length; i++) {
		      if (!shouldIgnoreNode(node.childNodes[i])) {
		        res = parsePlistXML(node.childNodes[i]);
		        if (null != res) new_arr.push(res);
		      }
		    }
		    return new_arr;

		  } else if (node.nodeName === '#text') ; else if (node.nodeName === 'key') {
		    if (isEmptyNode(node)) {
		      return '';
		    }

		    invariant(
		      node.childNodes[0].nodeValue !== '__proto__',
		      '__proto__ keys can lead to prototype pollution. More details on CVE-2022-22912'
		    );

		    return node.childNodes[0].nodeValue;
		  } else if (node.nodeName === 'string') {
		    res = '';
		    if (isEmptyNode(node)) {
		      return res;
		    }
		    for (i=0; i < node.childNodes.length; i++) {
		      var type = node.childNodes[i].nodeType;
		      if (type === TEXT_NODE || type === CDATA_NODE) {
		        res += node.childNodes[i].nodeValue;
		      }
		    }
		    return res;

		  } else if (node.nodeName === 'integer') {
		    invariant(
		      !isEmptyNode(node),
		      'Cannot parse "" as integer.'
		    );
		    return parseInt(node.childNodes[0].nodeValue, 10);

		  } else if (node.nodeName === 'real') {
		    invariant(
		      !isEmptyNode(node),
		      'Cannot parse "" as real.'
		    );
		    res = '';
		    for (i=0; i < node.childNodes.length; i++) {
		      if (node.childNodes[i].nodeType === TEXT_NODE) {
		        res += node.childNodes[i].nodeValue;
		      }
		    }
		    return parseFloat(res);

		  } else if (node.nodeName === 'data') {
		    res = '';
		    if (isEmptyNode(node)) {
		      return Buffer.from(res, 'base64');
		    }
		    for (i=0; i < node.childNodes.length; i++) {
		      if (node.childNodes[i].nodeType === TEXT_NODE) {
		        res += node.childNodes[i].nodeValue.replace(/\s+/g, '');
		      }
		    }
		    return Buffer.from(res, 'base64');

		  } else if (node.nodeName === 'date') {
		    invariant(
		      !isEmptyNode(node),
		      'Cannot parse "" as Date.'
		    );
		    return new Date(node.childNodes[0].nodeValue);

		  } else if (node.nodeName === 'null') {
		    return null;

		  } else if (node.nodeName === 'true') {
		    return true;

		  } else if (node.nodeName === 'false') {
		    return false;
		  } else {
		    throw new Error('Invalid PLIST tag ' + node.nodeName);
		  }
		}
		return parse;
	}

	var build = {};

	var base64Js = {};

	var hasRequiredBase64Js;

	function requireBase64Js () {
		if (hasRequiredBase64Js) return base64Js;
		hasRequiredBase64Js = 1;

		base64Js.byteLength = byteLength;
		base64Js.toByteArray = toByteArray;
		base64Js.fromByteArray = fromByteArray;

		var lookup = [];
		var revLookup = [];
		var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;

		var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
		for (var i = 0, len = code.length; i < len; ++i) {
		  lookup[i] = code[i];
		  revLookup[code.charCodeAt(i)] = i;
		}

		// Support decoding URL-safe base64 strings, as Node.js does.
		// See: https://en.wikipedia.org/wiki/Base64#URL_applications
		revLookup['-'.charCodeAt(0)] = 62;
		revLookup['_'.charCodeAt(0)] = 63;

		function getLens (b64) {
		  var len = b64.length;

		  if (len % 4 > 0) {
		    throw new Error('Invalid string. Length must be a multiple of 4')
		  }

		  // Trim off extra bytes after placeholder bytes are found
		  // See: https://github.com/beatgammit/base64-js/issues/42
		  var validLen = b64.indexOf('=');
		  if (validLen === -1) validLen = len;

		  var placeHoldersLen = validLen === len
		    ? 0
		    : 4 - (validLen % 4);

		  return [validLen, placeHoldersLen]
		}

		// base64 is 4/3 + up to two characters of the original data
		function byteLength (b64) {
		  var lens = getLens(b64);
		  var validLen = lens[0];
		  var placeHoldersLen = lens[1];
		  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
		}

		function _byteLength (b64, validLen, placeHoldersLen) {
		  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
		}

		function toByteArray (b64) {
		  var tmp;
		  var lens = getLens(b64);
		  var validLen = lens[0];
		  var placeHoldersLen = lens[1];

		  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));

		  var curByte = 0;

		  // if there are placeholders, only get up to the last complete 4 chars
		  var len = placeHoldersLen > 0
		    ? validLen - 4
		    : validLen;

		  var i;
		  for (i = 0; i < len; i += 4) {
		    tmp =
		      (revLookup[b64.charCodeAt(i)] << 18) |
		      (revLookup[b64.charCodeAt(i + 1)] << 12) |
		      (revLookup[b64.charCodeAt(i + 2)] << 6) |
		      revLookup[b64.charCodeAt(i + 3)];
		    arr[curByte++] = (tmp >> 16) & 0xFF;
		    arr[curByte++] = (tmp >> 8) & 0xFF;
		    arr[curByte++] = tmp & 0xFF;
		  }

		  if (placeHoldersLen === 2) {
		    tmp =
		      (revLookup[b64.charCodeAt(i)] << 2) |
		      (revLookup[b64.charCodeAt(i + 1)] >> 4);
		    arr[curByte++] = tmp & 0xFF;
		  }

		  if (placeHoldersLen === 1) {
		    tmp =
		      (revLookup[b64.charCodeAt(i)] << 10) |
		      (revLookup[b64.charCodeAt(i + 1)] << 4) |
		      (revLookup[b64.charCodeAt(i + 2)] >> 2);
		    arr[curByte++] = (tmp >> 8) & 0xFF;
		    arr[curByte++] = tmp & 0xFF;
		  }

		  return arr
		}

		function tripletToBase64 (num) {
		  return lookup[num >> 18 & 0x3F] +
		    lookup[num >> 12 & 0x3F] +
		    lookup[num >> 6 & 0x3F] +
		    lookup[num & 0x3F]
		}

		function encodeChunk (uint8, start, end) {
		  var tmp;
		  var output = [];
		  for (var i = start; i < end; i += 3) {
		    tmp =
		      ((uint8[i] << 16) & 0xFF0000) +
		      ((uint8[i + 1] << 8) & 0xFF00) +
		      (uint8[i + 2] & 0xFF);
		    output.push(tripletToBase64(tmp));
		  }
		  return output.join('')
		}

		function fromByteArray (uint8) {
		  var tmp;
		  var len = uint8.length;
		  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
		  var parts = [];
		  var maxChunkLength = 16383; // must be multiple of 3

		  // go through the array every three bytes, we'll deal with trailing stuff later
		  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
		    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
		  }

		  // pad the end with zeros, but make sure to not forget the extra bytes
		  if (extraBytes === 1) {
		    tmp = uint8[len - 1];
		    parts.push(
		      lookup[tmp >> 2] +
		      lookup[(tmp << 4) & 0x3F] +
		      '=='
		    );
		  } else if (extraBytes === 2) {
		    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
		    parts.push(
		      lookup[tmp >> 10] +
		      lookup[(tmp >> 4) & 0x3F] +
		      lookup[(tmp << 2) & 0x3F] +
		      '='
		    );
		  }

		  return parts.join('')
		}
		return base64Js;
	}

	var lib = {};

	var Utility = {};

	var hasRequiredUtility;

	function requireUtility () {
		if (hasRequiredUtility) return Utility;
		hasRequiredUtility = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  // Copies all enumerable own properties from `sources` to `target`
		  var assign, getValue, isArray, isEmpty, isFunction, isObject, isPlainObject,
		    hasProp = {}.hasOwnProperty;

		  assign = function(target, ...sources) {
		    var i, key, len, source;
		    if (isFunction(Object.assign)) {
		      Object.assign.apply(null, arguments);
		    } else {
		      for (i = 0, len = sources.length; i < len; i++) {
		        source = sources[i];
		        if (source != null) {
		          for (key in source) {
		            if (!hasProp.call(source, key)) continue;
		            target[key] = source[key];
		          }
		        }
		      }
		    }
		    return target;
		  };

		  // Determines if `val` is a Function object
		  isFunction = function(val) {
		    return !!val && Object.prototype.toString.call(val) === '[object Function]';
		  };

		  // Determines if `val` is an Object
		  isObject = function(val) {
		    var ref;
		    return !!val && ((ref = typeof val) === 'function' || ref === 'object');
		  };

		  // Determines if `val` is an Array
		  isArray = function(val) {
		    if (isFunction(Array.isArray)) {
		      return Array.isArray(val);
		    } else {
		      return Object.prototype.toString.call(val) === '[object Array]';
		    }
		  };

		  // Determines if `val` is an empty Array or an Object with no own properties
		  isEmpty = function(val) {
		    var key;
		    if (isArray(val)) {
		      return !val.length;
		    } else {
		      for (key in val) {
		        if (!hasProp.call(val, key)) continue;
		        return false;
		      }
		      return true;
		    }
		  };

		  // Determines if `val` is a plain Object
		  isPlainObject = function(val) {
		    var ctor, proto;
		    return isObject(val) && (proto = Object.getPrototypeOf(val)) && (ctor = proto.constructor) && (typeof ctor === 'function') && (ctor instanceof ctor) && (Function.prototype.toString.call(ctor) === Function.prototype.toString.call(Object));
		  };

		  // Gets the primitive value of an object
		  getValue = function(obj) {
		    if (isFunction(obj.valueOf)) {
		      return obj.valueOf();
		    } else {
		      return obj;
		    }
		  };

		  Utility.assign = assign;

		  Utility.isFunction = isFunction;

		  Utility.isObject = isObject;

		  Utility.isArray = isArray;

		  Utility.isEmpty = isEmpty;

		  Utility.isPlainObject = isPlainObject;

		  Utility.getValue = getValue;

		}).call(Utility);
		return Utility;
	}

	var XMLDOMImplementation$1 = {exports: {}};

	var XMLDOMImplementation = XMLDOMImplementation$1.exports;

	var hasRequiredXMLDOMImplementation;

	function requireXMLDOMImplementation () {
		if (hasRequiredXMLDOMImplementation) return XMLDOMImplementation$1.exports;
		hasRequiredXMLDOMImplementation = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {

		  XMLDOMImplementation$1.exports = class XMLDOMImplementation {
		    // Tests if the DOM implementation implements a specific feature.

		    // `feature` package name of the feature to test. In Level 1, the
		    //           legal values are "HTML" and "XML" (case-insensitive).
		    // `version` version number of the package name to test. 
		    //           In Level 1, this is the string "1.0". If the version is 
		    //           not specified, supporting any version of the feature will 
		    //           cause the method to return true.
		    hasFeature(feature, version) {
		      return true;
		    }

		    // Creates a new document type declaration.

		    // `qualifiedName` qualified name of the document type to be created
		    // `publicId` public identifier of the external subset
		    // `systemId` system identifier of the external subset
		    createDocumentType(qualifiedName, publicId, systemId) {
		      throw new Error("This DOM method is not implemented.");
		    }

		    // Creates a new document.

		    // `namespaceURI` namespace URI of the document element to create
		    // `qualifiedName` the qualified name of the document to be created
		    // `doctype` the type of document to be created or null
		    createDocument(namespaceURI, qualifiedName, doctype) {
		      throw new Error("This DOM method is not implemented.");
		    }

		    // Creates a new HTML document.

		    // `title` document title
		    createHTMLDocument(title) {
		      throw new Error("This DOM method is not implemented.");
		    }

		    // Returns a specialized object which implements the specialized APIs 
		    // of the specified feature and version.

		    // `feature` name of the feature requested.
		    // `version` version number of the feature to test
		    getFeature(feature, version) {
		      throw new Error("This DOM method is not implemented.");
		    }

		  };

		}).call(XMLDOMImplementation);
		return XMLDOMImplementation$1.exports;
	}

	var XMLDocument$1 = {exports: {}};

	var XMLDOMConfiguration$1 = {exports: {}};

	var XMLDOMErrorHandler$1 = {exports: {}};

	var XMLDOMErrorHandler = XMLDOMErrorHandler$1.exports;

	var hasRequiredXMLDOMErrorHandler;

	function requireXMLDOMErrorHandler () {
		if (hasRequiredXMLDOMErrorHandler) return XMLDOMErrorHandler$1.exports;
		hasRequiredXMLDOMErrorHandler = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {

		  XMLDOMErrorHandler$1.exports = class XMLDOMErrorHandler {
		    // Initializes a new instance of `XMLDOMErrorHandler`

		    constructor() {}

		    // Called on the error handler when an error occurs.

		    // `error` the error message as a string
		    handleError(error) {
		      throw new Error(error);
		    }

		  };

		}).call(XMLDOMErrorHandler);
		return XMLDOMErrorHandler$1.exports;
	}

	var XMLDOMStringList$1 = {exports: {}};

	var XMLDOMStringList = XMLDOMStringList$1.exports;

	var hasRequiredXMLDOMStringList;

	function requireXMLDOMStringList () {
		if (hasRequiredXMLDOMStringList) return XMLDOMStringList$1.exports;
		hasRequiredXMLDOMStringList = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {

		  XMLDOMStringList$1.exports = (function() {
		    class XMLDOMStringList {
		      // Initializes a new instance of `XMLDOMStringList`
		      // This is just a wrapper around an ordinary
		      // JS array.

		      // `arr` the array of string values
		      constructor(arr) {
		        this.arr = arr || [];
		      }

		      // Returns the indexth item in the collection.

		      // `index` index into the collection
		      item(index) {
		        return this.arr[index] || null;
		      }

		      // Test if a string is part of this DOMStringList.

		      // `str` the string to look for
		      contains(str) {
		        return this.arr.indexOf(str) !== -1;
		      }

		    }
		    // Returns the number of strings in the list.
		    Object.defineProperty(XMLDOMStringList.prototype, 'length', {
		      get: function() {
		        return this.arr.length;
		      }
		    });

		    return XMLDOMStringList;

		  }).call(this);

		}).call(XMLDOMStringList);
		return XMLDOMStringList$1.exports;
	}

	var XMLDOMConfiguration = XMLDOMConfiguration$1.exports;

	var hasRequiredXMLDOMConfiguration;

	function requireXMLDOMConfiguration () {
		if (hasRequiredXMLDOMConfiguration) return XMLDOMConfiguration$1.exports;
		hasRequiredXMLDOMConfiguration = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var XMLDOMErrorHandler, XMLDOMStringList;

		  XMLDOMErrorHandler = requireXMLDOMErrorHandler();

		  XMLDOMStringList = requireXMLDOMStringList();

		  // Implements the DOMConfiguration interface
		  XMLDOMConfiguration$1.exports = (function() {
		    class XMLDOMConfiguration {
		      constructor() {
		        this.defaultParams = {
		          "canonical-form": false,
		          "cdata-sections": false,
		          "comments": false,
		          "datatype-normalization": false,
		          "element-content-whitespace": true,
		          "entities": true,
		          "error-handler": new XMLDOMErrorHandler(),
		          "infoset": true,
		          "validate-if-schema": false,
		          "namespaces": true,
		          "namespace-declarations": true,
		          "normalize-characters": false,
		          "schema-location": '',
		          "schema-type": '',
		          "split-cdata-sections": true,
		          "validate": false,
		          "well-formed": true
		        };
		        this.params = Object.create(this.defaultParams);
		      }

		      // Gets the value of a parameter.

		      // `name` name of the parameter
		      getParameter(name) {
		        if (this.params.hasOwnProperty(name)) {
		          return this.params[name];
		        } else {
		          return null;
		        }
		      }

		      // Checks if setting a parameter to a specific value is supported.

		      // `name` name of the parameter
		      // `value` parameter value
		      canSetParameter(name, value) {
		        return true;
		      }

		      // Sets the value of a parameter.

		      // `name` name of the parameter
		      // `value` new value or null if the user wishes to unset the parameter
		      setParameter(name, value) {
		        if (value != null) {
		          return this.params[name] = value;
		        } else {
		          return delete this.params[name];
		        }
		      }

		    }
		    // Returns the list of parameter names
		    Object.defineProperty(XMLDOMConfiguration.prototype, 'parameterNames', {
		      get: function() {
		        return new XMLDOMStringList(Object.keys(this.defaultParams));
		      }
		    });

		    return XMLDOMConfiguration;

		  }).call(this);

		}).call(XMLDOMConfiguration);
		return XMLDOMConfiguration$1.exports;
	}

	var XMLNode$1 = {exports: {}};

	var XMLElement$1 = {exports: {}};

	var NodeType$1 = {exports: {}};

	var NodeType = NodeType$1.exports;

	var hasRequiredNodeType;

	function requireNodeType () {
		if (hasRequiredNodeType) return NodeType$1.exports;
		hasRequiredNodeType = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  NodeType$1.exports = {
		    Element: 1,
		    Attribute: 2,
		    Text: 3,
		    CData: 4,
		    EntityReference: 5,
		    EntityDeclaration: 6,
		    ProcessingInstruction: 7,
		    Comment: 8,
		    Document: 9,
		    DocType: 10,
		    DocumentFragment: 11,
		    NotationDeclaration: 12,
		    // Numeric codes up to 200 are reserved to W3C for possible future use.
		    // Following are types internal to this library:
		    Declaration: 201,
		    Raw: 202,
		    AttributeDeclaration: 203,
		    ElementDeclaration: 204,
		    Dummy: 205
		  };

		}).call(NodeType);
		return NodeType$1.exports;
	}

	var XMLAttribute$1 = {exports: {}};

	var XMLAttribute = XMLAttribute$1.exports;

	var hasRequiredXMLAttribute;

	function requireXMLAttribute () {
		if (hasRequiredXMLAttribute) return XMLAttribute$1.exports;
		hasRequiredXMLAttribute = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType;

		  NodeType = requireNodeType();

		  requireXMLNode();

		  // Represents an attribute
		  XMLAttribute$1.exports = (function() {
		    class XMLAttribute {
		      // Initializes a new instance of `XMLAttribute`

		      // `parent` the parent node
		      // `name` attribute target
		      // `value` attribute value
		      constructor(parent, name, value) {
		        this.parent = parent;
		        if (this.parent) {
		          this.options = this.parent.options;
		          this.stringify = this.parent.stringify;
		        }
		        if (name == null) {
		          throw new Error("Missing attribute name. " + this.debugInfo(name));
		        }
		        this.name = this.stringify.name(name);
		        this.value = this.stringify.attValue(value);
		        this.type = NodeType.Attribute;
		        // DOM level 3
		        this.isId = false;
		        this.schemaTypeInfo = null;
		      }

		      // Creates and returns a deep clone of `this`
		      clone() {
		        return Object.create(this);
		      }

		      // Converts the XML fragment to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.attribute(this, this.options.writer.filterOptions(options));
		      }

		      
		      // Returns debug string for this node
		      debugInfo(name) {
		        name = name || this.name;
		        if (name == null) {
		          return "parent: <" + this.parent.name + ">";
		        } else {
		          return "attribute: {" + name + "}, parent: <" + this.parent.name + ">";
		        }
		      }

		      isEqualNode(node) {
		        if (node.namespaceURI !== this.namespaceURI) {
		          return false;
		        }
		        if (node.prefix !== this.prefix) {
		          return false;
		        }
		        if (node.localName !== this.localName) {
		          return false;
		        }
		        if (node.value !== this.value) {
		          return false;
		        }
		        return true;
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLAttribute.prototype, 'nodeType', {
		      get: function() {
		        return this.type;
		      }
		    });

		    Object.defineProperty(XMLAttribute.prototype, 'ownerElement', {
		      get: function() {
		        return this.parent;
		      }
		    });

		    // DOM level 3
		    Object.defineProperty(XMLAttribute.prototype, 'textContent', {
		      get: function() {
		        return this.value;
		      },
		      set: function(value) {
		        return this.value = value || '';
		      }
		    });

		    // DOM level 4
		    Object.defineProperty(XMLAttribute.prototype, 'namespaceURI', {
		      get: function() {
		        return '';
		      }
		    });

		    Object.defineProperty(XMLAttribute.prototype, 'prefix', {
		      get: function() {
		        return '';
		      }
		    });

		    Object.defineProperty(XMLAttribute.prototype, 'localName', {
		      get: function() {
		        return this.name;
		      }
		    });

		    Object.defineProperty(XMLAttribute.prototype, 'specified', {
		      get: function() {
		        return true;
		      }
		    });

		    return XMLAttribute;

		  }).call(this);

		}).call(XMLAttribute);
		return XMLAttribute$1.exports;
	}

	var XMLNamedNodeMap$1 = {exports: {}};

	var XMLNamedNodeMap = XMLNamedNodeMap$1.exports;

	var hasRequiredXMLNamedNodeMap;

	function requireXMLNamedNodeMap () {
		if (hasRequiredXMLNamedNodeMap) return XMLNamedNodeMap$1.exports;
		hasRequiredXMLNamedNodeMap = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {

		  XMLNamedNodeMap$1.exports = (function() {
		    class XMLNamedNodeMap {
		      // Initializes a new instance of `XMLNamedNodeMap`
		      // This is just a wrapper around an ordinary
		      // JS object.

		      // `nodes` the object containing nodes.
		      constructor(nodes) {
		        this.nodes = nodes;
		      }

		      // Creates and returns a deep clone of `this`

		      clone() {
		        // this class should not be cloned since it wraps
		        // around a given object. The calling function should check
		        // whether the wrapped object is null and supply a new object
		        // (from the clone).
		        return this.nodes = null;
		      }

		      // DOM Level 1
		      getNamedItem(name) {
		        return this.nodes[name];
		      }

		      setNamedItem(node) {
		        var oldNode;
		        oldNode = this.nodes[node.nodeName];
		        this.nodes[node.nodeName] = node;
		        return oldNode || null;
		      }

		      removeNamedItem(name) {
		        var oldNode;
		        oldNode = this.nodes[name];
		        delete this.nodes[name];
		        return oldNode || null;
		      }

		      item(index) {
		        return this.nodes[Object.keys(this.nodes)[index]] || null;
		      }

		      // DOM level 2 functions to be implemented later
		      getNamedItemNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented.");
		      }

		      setNamedItemNS(node) {
		        throw new Error("This DOM method is not implemented.");
		      }

		      removeNamedItemNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented.");
		      }

		    }
		    
		    // DOM level 1
		    Object.defineProperty(XMLNamedNodeMap.prototype, 'length', {
		      get: function() {
		        return Object.keys(this.nodes).length || 0;
		      }
		    });

		    return XMLNamedNodeMap;

		  }).call(this);

		}).call(XMLNamedNodeMap);
		return XMLNamedNodeMap$1.exports;
	}

	var XMLElement = XMLElement$1.exports;

	var hasRequiredXMLElement;

	function requireXMLElement () {
		if (hasRequiredXMLElement) return XMLElement$1.exports;
		hasRequiredXMLElement = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLAttribute, XMLNamedNodeMap, XMLNode, getValue, isFunction, isObject,
		    hasProp = {}.hasOwnProperty;

		  ({isObject, isFunction, getValue} = requireUtility());

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  XMLAttribute = requireXMLAttribute();

		  XMLNamedNodeMap = requireXMLNamedNodeMap();

		  // Represents an element of the XML document
		  XMLElement$1.exports = (function() {
		    class XMLElement extends XMLNode {
		      // Initializes a new instance of `XMLElement`

		      // `parent` the parent node
		      // `name` element name
		      // `attributes` an object containing name/value pairs of attributes
		      constructor(parent, name, attributes) {
		        var child, j, len, ref;
		        super(parent);
		        if (name == null) {
		          throw new Error("Missing element name. " + this.debugInfo());
		        }
		        this.name = this.stringify.name(name);
		        this.type = NodeType.Element;
		        this.attribs = {};
		        this.schemaTypeInfo = null;
		        if (attributes != null) {
		          this.attribute(attributes);
		        }
		        // set properties if this is the root node
		        if (parent.type === NodeType.Document) {
		          this.isRoot = true;
		          this.documentObject = parent;
		          parent.rootObject = this;
		          // set dtd name
		          if (parent.children) {
		            ref = parent.children;
		            for (j = 0, len = ref.length; j < len; j++) {
		              child = ref[j];
		              if (child.type === NodeType.DocType) {
		                child.name = this.name;
		                break;
		              }
		            }
		          }
		        }
		      }

		      // Creates and returns a deep clone of `this`

		      clone() {
		        var att, attName, clonedSelf, ref;
		        clonedSelf = Object.create(this);
		        // remove document element
		        if (clonedSelf.isRoot) {
		          clonedSelf.documentObject = null;
		        }
		        // clone attributes
		        clonedSelf.attribs = {};
		        ref = this.attribs;
		        for (attName in ref) {
		          if (!hasProp.call(ref, attName)) continue;
		          att = ref[attName];
		          clonedSelf.attribs[attName] = att.clone();
		        }
		        // clone child nodes
		        clonedSelf.children = [];
		        this.children.forEach(function(child) {
		          var clonedChild;
		          clonedChild = child.clone();
		          clonedChild.parent = clonedSelf;
		          return clonedSelf.children.push(clonedChild);
		        });
		        return clonedSelf;
		      }

		      // Adds or modifies an attribute

		      // `name` attribute name
		      // `value` attribute value
		      attribute(name, value) {
		        var attName, attValue;
		        if (name != null) {
		          name = getValue(name);
		        }
		        if (isObject(name)) { // expand if object
		          for (attName in name) {
		            if (!hasProp.call(name, attName)) continue;
		            attValue = name[attName];
		            this.attribute(attName, attValue);
		          }
		        } else {
		          if (isFunction(value)) {
		            value = value.apply();
		          }
		          if (this.options.keepNullAttributes && (value == null)) {
		            this.attribs[name] = new XMLAttribute(this, name, "");
		          } else if (value != null) {
		            this.attribs[name] = new XMLAttribute(this, name, value);
		          }
		        }
		        return this;
		      }

		      // Removes an attribute

		      // `name` attribute name
		      removeAttribute(name) {
		        var attName, j, len;
		        // Also defined in DOM level 1
		        // removeAttribute(name) removes an attribute by name.
		        if (name == null) {
		          throw new Error("Missing attribute name. " + this.debugInfo());
		        }
		        name = getValue(name);
		        if (Array.isArray(name)) { // expand if array
		          for (j = 0, len = name.length; j < len; j++) {
		            attName = name[j];
		            delete this.attribs[attName];
		          }
		        } else {
		          delete this.attribs[name];
		        }
		        return this;
		      }

		      // Converts the XML fragment to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      // `options.allowEmpty` do not self close empty element tags
		      toString(options) {
		        return this.options.writer.element(this, this.options.writer.filterOptions(options));
		      }

		      // Aliases
		      att(name, value) {
		        return this.attribute(name, value);
		      }

		      a(name, value) {
		        return this.attribute(name, value);
		      }

		      // DOM Level 1
		      getAttribute(name) {
		        if (this.attribs.hasOwnProperty(name)) {
		          return this.attribs[name].value;
		        } else {
		          return null;
		        }
		      }

		      setAttribute(name, value) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getAttributeNode(name) {
		        if (this.attribs.hasOwnProperty(name)) {
		          return this.attribs[name];
		        } else {
		          return null;
		        }
		      }

		      setAttributeNode(newAttr) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      removeAttributeNode(oldAttr) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByTagName(name) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM Level 2
		      getAttributeNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      setAttributeNS(namespaceURI, qualifiedName, value) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      removeAttributeNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getAttributeNodeNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      setAttributeNodeNS(newAttr) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByTagNameNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      hasAttribute(name) {
		        return this.attribs.hasOwnProperty(name);
		      }

		      hasAttributeNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM Level 3
		      setIdAttribute(name, isId) {
		        if (this.attribs.hasOwnProperty(name)) {
		          return this.attribs[name].isId;
		        } else {
		          return isId;
		        }
		      }

		      setIdAttributeNS(namespaceURI, localName, isId) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      setIdAttributeNode(idAttr, isId) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM Level 4
		      getElementsByTagName(tagname) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByTagNameNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByClassName(classNames) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      isEqualNode(node) {
		        var i, j, ref;
		        if (!super.isEqualNode(node)) {
		          return false;
		        }
		        if (node.namespaceURI !== this.namespaceURI) {
		          return false;
		        }
		        if (node.prefix !== this.prefix) {
		          return false;
		        }
		        if (node.localName !== this.localName) {
		          return false;
		        }
		        if (node.attribs.length !== this.attribs.length) {
		          return false;
		        }
		        for (i = j = 0, ref = this.attribs.length - 1; (0 <= ref ? j <= ref : j >= ref); i = 0 <= ref ? ++j : --j) {
		          if (!this.attribs[i].isEqualNode(node.attribs[i])) {
		            return false;
		          }
		        }
		        return true;
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLElement.prototype, 'tagName', {
		      get: function() {
		        return this.name;
		      }
		    });

		    // DOM level 4
		    Object.defineProperty(XMLElement.prototype, 'namespaceURI', {
		      get: function() {
		        return '';
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'prefix', {
		      get: function() {
		        return '';
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'localName', {
		      get: function() {
		        return this.name;
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'id', {
		      get: function() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'className', {
		      get: function() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'classList', {
		      get: function() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    Object.defineProperty(XMLElement.prototype, 'attributes', {
		      get: function() {
		        if (!this.attributeMap || !this.attributeMap.nodes) {
		          this.attributeMap = new XMLNamedNodeMap(this.attribs);
		        }
		        return this.attributeMap;
		      }
		    });

		    return XMLElement;

		  }).call(this);

		}).call(XMLElement);
		return XMLElement$1.exports;
	}

	var XMLCData$1 = {exports: {}};

	var XMLCharacterData$1 = {exports: {}};

	var XMLCharacterData = XMLCharacterData$1.exports;

	var hasRequiredXMLCharacterData;

	function requireXMLCharacterData () {
		if (hasRequiredXMLCharacterData) return XMLCharacterData$1.exports;
		hasRequiredXMLCharacterData = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var XMLNode;

		  XMLNode = requireXMLNode();

		  // Represents a character data node
		  XMLCharacterData$1.exports = (function() {
		    class XMLCharacterData extends XMLNode {
		      // Initializes a new instance of `XMLCharacterData`

		      constructor(parent) {
		        super(parent);
		        this.value = '';
		      }

		      
		      // Creates and returns a deep clone of `this`
		      clone() {
		        return Object.create(this);
		      }

		      // DOM level 1 functions to be implemented later
		      substringData(offset, count) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      appendData(arg) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      insertData(offset, arg) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      deleteData(offset, count) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      replaceData(offset, count, arg) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      isEqualNode(node) {
		        if (!super.isEqualNode(node)) {
		          return false;
		        }
		        if (node.data !== this.data) {
		          return false;
		        }
		        return true;
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLCharacterData.prototype, 'data', {
		      get: function() {
		        return this.value;
		      },
		      set: function(value) {
		        return this.value = value || '';
		      }
		    });

		    Object.defineProperty(XMLCharacterData.prototype, 'length', {
		      get: function() {
		        return this.value.length;
		      }
		    });

		    // DOM level 3
		    Object.defineProperty(XMLCharacterData.prototype, 'textContent', {
		      get: function() {
		        return this.value;
		      },
		      set: function(value) {
		        return this.value = value || '';
		      }
		    });

		    return XMLCharacterData;

		  }).call(this);

		}).call(XMLCharacterData);
		return XMLCharacterData$1.exports;
	}

	var XMLCData = XMLCData$1.exports;

	var hasRequiredXMLCData;

	function requireXMLCData () {
		if (hasRequiredXMLCData) return XMLCData$1.exports;
		hasRequiredXMLCData = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLCharacterData;

		  NodeType = requireNodeType();

		  XMLCharacterData = requireXMLCharacterData();

		  // Represents a  CDATA node
		  XMLCData$1.exports = class XMLCData extends XMLCharacterData {
		    // Initializes a new instance of `XMLCData`

		    // `text` CDATA text
		    constructor(parent, text) {
		      super(parent);
		      if (text == null) {
		        throw new Error("Missing CDATA text. " + this.debugInfo());
		      }
		      this.name = "#cdata-section";
		      this.type = NodeType.CData;
		      this.value = this.stringify.cdata(text);
		    }

		    // Creates and returns a deep clone of `this`
		    clone() {
		      return Object.create(this);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.cdata(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLCData);
		return XMLCData$1.exports;
	}

	var XMLComment$1 = {exports: {}};

	var XMLComment = XMLComment$1.exports;

	var hasRequiredXMLComment;

	function requireXMLComment () {
		if (hasRequiredXMLComment) return XMLComment$1.exports;
		hasRequiredXMLComment = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLCharacterData;

		  NodeType = requireNodeType();

		  XMLCharacterData = requireXMLCharacterData();

		  // Represents a comment node
		  XMLComment$1.exports = class XMLComment extends XMLCharacterData {
		    // Initializes a new instance of `XMLComment`

		    // `text` comment text
		    constructor(parent, text) {
		      super(parent);
		      if (text == null) {
		        throw new Error("Missing comment text. " + this.debugInfo());
		      }
		      this.name = "#comment";
		      this.type = NodeType.Comment;
		      this.value = this.stringify.comment(text);
		    }

		    // Creates and returns a deep clone of `this`
		    clone() {
		      return Object.create(this);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.comment(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLComment);
		return XMLComment$1.exports;
	}

	var XMLDeclaration$1 = {exports: {}};

	var XMLDeclaration = XMLDeclaration$1.exports;

	var hasRequiredXMLDeclaration;

	function requireXMLDeclaration () {
		if (hasRequiredXMLDeclaration) return XMLDeclaration$1.exports;
		hasRequiredXMLDeclaration = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode, isObject;

		  ({isObject} = requireUtility());

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents the XML declaration
		  XMLDeclaration$1.exports = class XMLDeclaration extends XMLNode {
		    // Initializes a new instance of `XMLDeclaration`

		    // `parent` the document object

		    // `version` A version number string, e.g. 1.0
		    // `encoding` Encoding declaration, e.g. UTF-8
		    // `standalone` standalone document declaration: true or false
		    constructor(parent, version, encoding, standalone) {
		      super(parent);
		      // arguments may also be passed as an object
		      if (isObject(version)) {
		        ({version, encoding, standalone} = version);
		      }
		      if (!version) {
		        version = '1.0';
		      }
		      this.type = NodeType.Declaration;
		      this.version = this.stringify.xmlVersion(version);
		      if (encoding != null) {
		        this.encoding = this.stringify.xmlEncoding(encoding);
		      }
		      if (standalone != null) {
		        this.standalone = this.stringify.xmlStandalone(standalone);
		      }
		    }

		    // Converts to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.declaration(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLDeclaration);
		return XMLDeclaration$1.exports;
	}

	var XMLDocType$1 = {exports: {}};

	var XMLDTDAttList$1 = {exports: {}};

	var XMLDTDAttList = XMLDTDAttList$1.exports;

	var hasRequiredXMLDTDAttList;

	function requireXMLDTDAttList () {
		if (hasRequiredXMLDTDAttList) return XMLDTDAttList$1.exports;
		hasRequiredXMLDTDAttList = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode;

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents an attribute list
		  XMLDTDAttList$1.exports = class XMLDTDAttList extends XMLNode {
		    // Initializes a new instance of `XMLDTDAttList`

		    // `parent` the parent `XMLDocType` element
		    // `elementName` the name of the element containing this attribute
		    // `attributeName` attribute name
		    // `attributeType` type of the attribute
		    // `defaultValueType` default value type (either #REQUIRED, #IMPLIED,
		    //                    #FIXED or #DEFAULT)
		    // `defaultValue` default value of the attribute
		    //                (only used for #FIXED or #DEFAULT)
		    constructor(parent, elementName, attributeName, attributeType, defaultValueType, defaultValue) {
		      super(parent);
		      if (elementName == null) {
		        throw new Error("Missing DTD element name. " + this.debugInfo());
		      }
		      if (attributeName == null) {
		        throw new Error("Missing DTD attribute name. " + this.debugInfo(elementName));
		      }
		      if (!attributeType) {
		        throw new Error("Missing DTD attribute type. " + this.debugInfo(elementName));
		      }
		      if (!defaultValueType) {
		        throw new Error("Missing DTD attribute default. " + this.debugInfo(elementName));
		      }
		      if (defaultValueType.indexOf('#') !== 0) {
		        defaultValueType = '#' + defaultValueType;
		      }
		      if (!defaultValueType.match(/^(#REQUIRED|#IMPLIED|#FIXED|#DEFAULT)$/)) {
		        throw new Error("Invalid default value type; expected: #REQUIRED, #IMPLIED, #FIXED or #DEFAULT. " + this.debugInfo(elementName));
		      }
		      if (defaultValue && !defaultValueType.match(/^(#FIXED|#DEFAULT)$/)) {
		        throw new Error("Default value only applies to #FIXED or #DEFAULT. " + this.debugInfo(elementName));
		      }
		      this.elementName = this.stringify.name(elementName);
		      this.type = NodeType.AttributeDeclaration;
		      this.attributeName = this.stringify.name(attributeName);
		      this.attributeType = this.stringify.dtdAttType(attributeType);
		      if (defaultValue) {
		        this.defaultValue = this.stringify.dtdAttDefault(defaultValue);
		      }
		      this.defaultValueType = defaultValueType;
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.dtdAttList(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLDTDAttList);
		return XMLDTDAttList$1.exports;
	}

	var XMLDTDEntity$1 = {exports: {}};

	var XMLDTDEntity = XMLDTDEntity$1.exports;

	var hasRequiredXMLDTDEntity;

	function requireXMLDTDEntity () {
		if (hasRequiredXMLDTDEntity) return XMLDTDEntity$1.exports;
		hasRequiredXMLDTDEntity = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode, isObject;

		  ({isObject} = requireUtility());

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents an entity declaration in the DTD
		  XMLDTDEntity$1.exports = (function() {
		    class XMLDTDEntity extends XMLNode {
		      // Initializes a new instance of `XMLDTDEntity`

		      // `parent` the parent `XMLDocType` element
		      // `pe` whether this is a parameter entity or a general entity
		      //      defaults to `false` (general entity)
		      // `name` the name of the entity
		      // `value` internal entity value or an object with external entity details
		      // `value.pubID` public identifier
		      // `value.sysID` system identifier
		      // `value.nData` notation declaration
		      constructor(parent, pe, name, value) {
		        super(parent);
		        if (name == null) {
		          throw new Error("Missing DTD entity name. " + this.debugInfo(name));
		        }
		        if (value == null) {
		          throw new Error("Missing DTD entity value. " + this.debugInfo(name));
		        }
		        this.pe = !!pe;
		        this.name = this.stringify.name(name);
		        this.type = NodeType.EntityDeclaration;
		        if (!isObject(value)) {
		          this.value = this.stringify.dtdEntityValue(value);
		          this.internal = true;
		        } else {
		          if (!value.pubID && !value.sysID) {
		            throw new Error("Public and/or system identifiers are required for an external entity. " + this.debugInfo(name));
		          }
		          if (value.pubID && !value.sysID) {
		            throw new Error("System identifier is required for a public external entity. " + this.debugInfo(name));
		          }
		          this.internal = false;
		          if (value.pubID != null) {
		            this.pubID = this.stringify.dtdPubID(value.pubID);
		          }
		          if (value.sysID != null) {
		            this.sysID = this.stringify.dtdSysID(value.sysID);
		          }
		          if (value.nData != null) {
		            this.nData = this.stringify.dtdNData(value.nData);
		          }
		          if (this.pe && this.nData) {
		            throw new Error("Notation declaration is not allowed in a parameter entity. " + this.debugInfo(name));
		          }
		        }
		      }

		      // Converts the XML fragment to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.dtdEntity(this, this.options.writer.filterOptions(options));
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLDTDEntity.prototype, 'publicId', {
		      get: function() {
		        return this.pubID;
		      }
		    });

		    Object.defineProperty(XMLDTDEntity.prototype, 'systemId', {
		      get: function() {
		        return this.sysID;
		      }
		    });

		    Object.defineProperty(XMLDTDEntity.prototype, 'notationName', {
		      get: function() {
		        return this.nData || null;
		      }
		    });

		    // DOM level 3
		    Object.defineProperty(XMLDTDEntity.prototype, 'inputEncoding', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDTDEntity.prototype, 'xmlEncoding', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDTDEntity.prototype, 'xmlVersion', {
		      get: function() {
		        return null;
		      }
		    });

		    return XMLDTDEntity;

		  }).call(this);

		}).call(XMLDTDEntity);
		return XMLDTDEntity$1.exports;
	}

	var XMLDTDElement$1 = {exports: {}};

	var XMLDTDElement = XMLDTDElement$1.exports;

	var hasRequiredXMLDTDElement;

	function requireXMLDTDElement () {
		if (hasRequiredXMLDTDElement) return XMLDTDElement$1.exports;
		hasRequiredXMLDTDElement = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode;

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents an attribute
		  XMLDTDElement$1.exports = class XMLDTDElement extends XMLNode {
		    // Initializes a new instance of `XMLDTDElement`

		    // `parent` the parent `XMLDocType` element
		    // `name` element name
		    // `value` element content (defaults to #PCDATA)
		    constructor(parent, name, value) {
		      super(parent);
		      if (name == null) {
		        throw new Error("Missing DTD element name. " + this.debugInfo());
		      }
		      if (!value) {
		        value = '(#PCDATA)';
		      }
		      if (Array.isArray(value)) {
		        value = '(' + value.join(',') + ')';
		      }
		      this.name = this.stringify.name(name);
		      this.type = NodeType.ElementDeclaration;
		      this.value = this.stringify.dtdElementValue(value);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.dtdElement(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLDTDElement);
		return XMLDTDElement$1.exports;
	}

	var XMLDTDNotation$1 = {exports: {}};

	var XMLDTDNotation = XMLDTDNotation$1.exports;

	var hasRequiredXMLDTDNotation;

	function requireXMLDTDNotation () {
		if (hasRequiredXMLDTDNotation) return XMLDTDNotation$1.exports;
		hasRequiredXMLDTDNotation = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode;

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents a NOTATION entry in the DTD
		  XMLDTDNotation$1.exports = (function() {
		    class XMLDTDNotation extends XMLNode {
		      // Initializes a new instance of `XMLDTDNotation`

		      // `parent` the parent `XMLDocType` element
		      // `name` the name of the notation
		      // `value` an object with external entity details
		      // `value.pubID` public identifier
		      // `value.sysID` system identifier
		      constructor(parent, name, value) {
		        super(parent);
		        if (name == null) {
		          throw new Error("Missing DTD notation name. " + this.debugInfo(name));
		        }
		        if (!value.pubID && !value.sysID) {
		          throw new Error("Public or system identifiers are required for an external entity. " + this.debugInfo(name));
		        }
		        this.name = this.stringify.name(name);
		        this.type = NodeType.NotationDeclaration;
		        if (value.pubID != null) {
		          this.pubID = this.stringify.dtdPubID(value.pubID);
		        }
		        if (value.sysID != null) {
		          this.sysID = this.stringify.dtdSysID(value.sysID);
		        }
		      }

		      // Converts the XML fragment to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.dtdNotation(this, this.options.writer.filterOptions(options));
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLDTDNotation.prototype, 'publicId', {
		      get: function() {
		        return this.pubID;
		      }
		    });

		    Object.defineProperty(XMLDTDNotation.prototype, 'systemId', {
		      get: function() {
		        return this.sysID;
		      }
		    });

		    return XMLDTDNotation;

		  }).call(this);

		}).call(XMLDTDNotation);
		return XMLDTDNotation$1.exports;
	}

	var XMLDocType = XMLDocType$1.exports;

	var hasRequiredXMLDocType;

	function requireXMLDocType () {
		if (hasRequiredXMLDocType) return XMLDocType$1.exports;
		hasRequiredXMLDocType = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLNamedNodeMap, XMLNode, isObject;

		  ({isObject} = requireUtility());

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  XMLDTDAttList = requireXMLDTDAttList();

		  XMLDTDEntity = requireXMLDTDEntity();

		  XMLDTDElement = requireXMLDTDElement();

		  XMLDTDNotation = requireXMLDTDNotation();

		  XMLNamedNodeMap = requireXMLNamedNodeMap();

		  // Represents doctype declaration
		  XMLDocType$1.exports = (function() {
		    class XMLDocType extends XMLNode {
		      // Initializes a new instance of `XMLDocType`

		      // `parent` the document object

		      // `pubID` public identifier of the external subset
		      // `sysID` system identifier of the external subset
		      constructor(parent, pubID, sysID) {
		        var child, i, len, ref;
		        super(parent);
		        this.type = NodeType.DocType;
		        // set DTD name to the name of the root node
		        if (parent.children) {
		          ref = parent.children;
		          for (i = 0, len = ref.length; i < len; i++) {
		            child = ref[i];
		            if (child.type === NodeType.Element) {
		              this.name = child.name;
		              break;
		            }
		          }
		        }
		        this.documentObject = parent;
		        // arguments may also be passed as an object
		        if (isObject(pubID)) {
		          ({pubID, sysID} = pubID);
		        }
		        if (sysID == null) {
		          [sysID, pubID] = [pubID, sysID];
		        }
		        if (pubID != null) {
		          this.pubID = this.stringify.dtdPubID(pubID);
		        }
		        if (sysID != null) {
		          this.sysID = this.stringify.dtdSysID(sysID);
		        }
		      }

		      // Creates an element type declaration

		      // `name` element name
		      // `value` element content (defaults to #PCDATA)
		      element(name, value) {
		        var child;
		        child = new XMLDTDElement(this, name, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates an attribute declaration

		      // `elementName` the name of the element containing this attribute
		      // `attributeName` attribute name
		      // `attributeType` type of the attribute (defaults to CDATA)
		      // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
		      //                    #DEFAULT) (defaults to #IMPLIED)
		      // `defaultValue` default value of the attribute
		      //                (only used for #FIXED or #DEFAULT)
		      attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
		        var child;
		        child = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a general entity declaration

		      // `name` the name of the entity
		      // `value` internal entity value or an object with external entity details
		      // `value.pubID` public identifier
		      // `value.sysID` system identifier
		      // `value.nData` notation declaration
		      entity(name, value) {
		        var child;
		        child = new XMLDTDEntity(this, false, name, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a parameter entity declaration

		      // `name` the name of the entity
		      // `value` internal entity value or an object with external entity details
		      // `value.pubID` public identifier
		      // `value.sysID` system identifier
		      pEntity(name, value) {
		        var child;
		        child = new XMLDTDEntity(this, true, name, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a NOTATION declaration

		      // `name` the name of the notation
		      // `value` an object with external entity details
		      // `value.pubID` public identifier
		      // `value.sysID` system identifier
		      notation(name, value) {
		        var child;
		        child = new XMLDTDNotation(this, name, value);
		        this.children.push(child);
		        return this;
		      }

		      // Converts to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.docType(this, this.options.writer.filterOptions(options));
		      }

		      // Aliases
		      ele(name, value) {
		        return this.element(name, value);
		      }

		      att(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
		        return this.attList(elementName, attributeName, attributeType, defaultValueType, defaultValue);
		      }

		      ent(name, value) {
		        return this.entity(name, value);
		      }

		      pent(name, value) {
		        return this.pEntity(name, value);
		      }

		      not(name, value) {
		        return this.notation(name, value);
		      }

		      up() {
		        return this.root() || this.documentObject;
		      }

		      isEqualNode(node) {
		        if (!super.isEqualNode(node)) {
		          return false;
		        }
		        if (node.name !== this.name) {
		          return false;
		        }
		        if (node.publicId !== this.publicId) {
		          return false;
		        }
		        if (node.systemId !== this.systemId) {
		          return false;
		        }
		        return true;
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLDocType.prototype, 'entities', {
		      get: function() {
		        var child, i, len, nodes, ref;
		        nodes = {};
		        ref = this.children;
		        for (i = 0, len = ref.length; i < len; i++) {
		          child = ref[i];
		          if ((child.type === NodeType.EntityDeclaration) && !child.pe) {
		            nodes[child.name] = child;
		          }
		        }
		        return new XMLNamedNodeMap(nodes);
		      }
		    });

		    Object.defineProperty(XMLDocType.prototype, 'notations', {
		      get: function() {
		        var child, i, len, nodes, ref;
		        nodes = {};
		        ref = this.children;
		        for (i = 0, len = ref.length; i < len; i++) {
		          child = ref[i];
		          if (child.type === NodeType.NotationDeclaration) {
		            nodes[child.name] = child;
		          }
		        }
		        return new XMLNamedNodeMap(nodes);
		      }
		    });

		    // DOM level 2
		    Object.defineProperty(XMLDocType.prototype, 'publicId', {
		      get: function() {
		        return this.pubID;
		      }
		    });

		    Object.defineProperty(XMLDocType.prototype, 'systemId', {
		      get: function() {
		        return this.sysID;
		      }
		    });

		    Object.defineProperty(XMLDocType.prototype, 'internalSubset', {
		      get: function() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    return XMLDocType;

		  }).call(this);

		}).call(XMLDocType);
		return XMLDocType$1.exports;
	}

	var XMLRaw$1 = {exports: {}};

	var XMLRaw = XMLRaw$1.exports;

	var hasRequiredXMLRaw;

	function requireXMLRaw () {
		if (hasRequiredXMLRaw) return XMLRaw$1.exports;
		hasRequiredXMLRaw = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode;

		  NodeType = requireNodeType();

		  XMLNode = requireXMLNode();

		  // Represents a  raw node
		  XMLRaw$1.exports = class XMLRaw extends XMLNode {
		    // Initializes a new instance of `XMLRaw`

		    // `text` raw text
		    constructor(parent, text) {
		      super(parent);
		      if (text == null) {
		        throw new Error("Missing raw text. " + this.debugInfo());
		      }
		      this.type = NodeType.Raw;
		      this.value = this.stringify.raw(text);
		    }

		    // Creates and returns a deep clone of `this`
		    clone() {
		      return Object.create(this);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.raw(this, this.options.writer.filterOptions(options));
		    }

		  };

		}).call(XMLRaw);
		return XMLRaw$1.exports;
	}

	var XMLText$1 = {exports: {}};

	var XMLText = XMLText$1.exports;

	var hasRequiredXMLText;

	function requireXMLText () {
		if (hasRequiredXMLText) return XMLText$1.exports;
		hasRequiredXMLText = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLCharacterData;

		  NodeType = requireNodeType();

		  XMLCharacterData = requireXMLCharacterData();

		  // Represents a text node
		  XMLText$1.exports = (function() {
		    class XMLText extends XMLCharacterData {
		      // Initializes a new instance of `XMLText`

		      // `text` element text
		      constructor(parent, text) {
		        super(parent);
		        if (text == null) {
		          throw new Error("Missing element text. " + this.debugInfo());
		        }
		        this.name = "#text";
		        this.type = NodeType.Text;
		        this.value = this.stringify.text(text);
		      }

		      // Creates and returns a deep clone of `this`
		      clone() {
		        return Object.create(this);
		      }

		      // Converts the XML fragment to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.text(this, this.options.writer.filterOptions(options));
		      }

		      // DOM level 1 functions to be implemented later
		      splitText(offset) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM level 3 functions to be implemented later
		      replaceWholeText(content) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		    }
		    // DOM level 3
		    Object.defineProperty(XMLText.prototype, 'isElementContentWhitespace', {
		      get: function() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    Object.defineProperty(XMLText.prototype, 'wholeText', {
		      get: function() {
		        var next, prev, str;
		        str = '';
		        prev = this.previousSibling;
		        while (prev) {
		          str = prev.data + str;
		          prev = prev.previousSibling;
		        }
		        str += this.data;
		        next = this.nextSibling;
		        while (next) {
		          str = str + next.data;
		          next = next.nextSibling;
		        }
		        return str;
		      }
		    });

		    return XMLText;

		  }).call(this);

		}).call(XMLText);
		return XMLText$1.exports;
	}

	var XMLProcessingInstruction$1 = {exports: {}};

	var XMLProcessingInstruction = XMLProcessingInstruction$1.exports;

	var hasRequiredXMLProcessingInstruction;

	function requireXMLProcessingInstruction () {
		if (hasRequiredXMLProcessingInstruction) return XMLProcessingInstruction$1.exports;
		hasRequiredXMLProcessingInstruction = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLCharacterData;

		  NodeType = requireNodeType();

		  XMLCharacterData = requireXMLCharacterData();

		  // Represents a processing instruction
		  XMLProcessingInstruction$1.exports = class XMLProcessingInstruction extends XMLCharacterData {
		    // Initializes a new instance of `XMLProcessingInstruction`

		    // `parent` the parent node
		    // `target` instruction target
		    // `value` instruction value
		    constructor(parent, target, value) {
		      super(parent);
		      if (target == null) {
		        throw new Error("Missing instruction target. " + this.debugInfo());
		      }
		      this.type = NodeType.ProcessingInstruction;
		      this.target = this.stringify.insTarget(target);
		      this.name = this.target;
		      if (value) {
		        this.value = this.stringify.insValue(value);
		      }
		    }

		    // Creates and returns a deep clone of `this`
		    clone() {
		      return Object.create(this);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return this.options.writer.processingInstruction(this, this.options.writer.filterOptions(options));
		    }

		    isEqualNode(node) {
		      if (!super.isEqualNode(node)) {
		        return false;
		      }
		      if (node.target !== this.target) {
		        return false;
		      }
		      return true;
		    }

		  };

		}).call(XMLProcessingInstruction);
		return XMLProcessingInstruction$1.exports;
	}

	var XMLDummy$1 = {exports: {}};

	var XMLDummy = XMLDummy$1.exports;

	var hasRequiredXMLDummy;

	function requireXMLDummy () {
		if (hasRequiredXMLDummy) return XMLDummy$1.exports;
		hasRequiredXMLDummy = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLNode;

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  // Represents a  raw node
		  XMLDummy$1.exports = class XMLDummy extends XMLNode {
		    // Initializes a new instance of `XMLDummy`

		    // `XMLDummy` is a special node representing a node with 
		    // a null value. Dummy nodes are created while recursively
		    // building the XML tree. Simply skipping null values doesn't
		    // work because that would break the recursive chain.
		    constructor(parent) {
		      super(parent);
		      this.type = NodeType.Dummy;
		    }

		    // Creates and returns a deep clone of `this`
		    clone() {
		      return Object.create(this);
		    }

		    // Converts the XML fragment to string

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation for pretty print
		    // `options.offset` how many indentations to add to every line for pretty print
		    // `options.newline` newline sequence for pretty print
		    toString(options) {
		      return '';
		    }

		  };

		}).call(XMLDummy);
		return XMLDummy$1.exports;
	}

	var XMLNodeList$1 = {exports: {}};

	var XMLNodeList = XMLNodeList$1.exports;

	var hasRequiredXMLNodeList;

	function requireXMLNodeList () {
		if (hasRequiredXMLNodeList) return XMLNodeList$1.exports;
		hasRequiredXMLNodeList = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {

		  XMLNodeList$1.exports = (function() {
		    class XMLNodeList {
		      // Initializes a new instance of `XMLNodeList`
		      // This is just a wrapper around an ordinary
		      // JS array.

		      // `nodes` the array containing nodes.
		      constructor(nodes) {
		        this.nodes = nodes;
		      }

		      // Creates and returns a deep clone of `this`

		      clone() {
		        // this class should not be cloned since it wraps
		        // around a given array. The calling function should check
		        // whether the wrapped array is null and supply a new array
		        // (from the clone).
		        return this.nodes = null;
		      }

		      // DOM Level 1
		      item(index) {
		        return this.nodes[index] || null;
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLNodeList.prototype, 'length', {
		      get: function() {
		        return this.nodes.length || 0;
		      }
		    });

		    return XMLNodeList;

		  }).call(this);

		}).call(XMLNodeList);
		return XMLNodeList$1.exports;
	}

	var DocumentPosition$1 = {exports: {}};

	var DocumentPosition = DocumentPosition$1.exports;

	var hasRequiredDocumentPosition;

	function requireDocumentPosition () {
		if (hasRequiredDocumentPosition) return DocumentPosition$1.exports;
		hasRequiredDocumentPosition = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  DocumentPosition$1.exports = {
		    Disconnected: 1,
		    Preceding: 2,
		    Following: 4,
		    Contains: 8,
		    ContainedBy: 16,
		    ImplementationSpecific: 32
		  };

		}).call(DocumentPosition);
		return DocumentPosition$1.exports;
	}

	var XMLNode = XMLNode$1.exports;

	var hasRequiredXMLNode;

	function requireXMLNode () {
		if (hasRequiredXMLNode) return XMLNode$1.exports;
		hasRequiredXMLNode = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var DocumentPosition, NodeType, XMLCData, XMLComment, XMLDeclaration, XMLDocType, XMLDummy, XMLElement, XMLNodeList, XMLProcessingInstruction, XMLRaw, XMLText, getValue, isEmpty, isFunction, isObject,
		    hasProp = {}.hasOwnProperty,
		    splice = [].splice;

		  ({isObject, isFunction, isEmpty, getValue} = requireUtility());

		  XMLElement = null;

		  XMLCData = null;

		  XMLComment = null;

		  XMLDeclaration = null;

		  XMLDocType = null;

		  XMLRaw = null;

		  XMLText = null;

		  XMLProcessingInstruction = null;

		  XMLDummy = null;

		  NodeType = null;

		  XMLNodeList = null;

		  DocumentPosition = null;

		  // Represents a generic XMl element
		  XMLNode$1.exports = (function() {
		    class XMLNode {
		      // Initializes a new instance of `XMLNode`

		      // `parent` the parent node
		      constructor(parent1) {
		        this.parent = parent1;
		        if (this.parent) {
		          this.options = this.parent.options;
		          this.stringify = this.parent.stringify;
		        }
		        this.value = null;
		        this.children = [];
		        this.baseURI = null;
		        // first execution, load dependencies that are otherwise
		        // circular (so we can't load them at the top)
		        if (!XMLElement) {
		          XMLElement = requireXMLElement();
		          XMLCData = requireXMLCData();
		          XMLComment = requireXMLComment();
		          XMLDeclaration = requireXMLDeclaration();
		          XMLDocType = requireXMLDocType();
		          XMLRaw = requireXMLRaw();
		          XMLText = requireXMLText();
		          XMLProcessingInstruction = requireXMLProcessingInstruction();
		          XMLDummy = requireXMLDummy();
		          NodeType = requireNodeType();
		          XMLNodeList = requireXMLNodeList();
		          requireXMLNamedNodeMap();
		          DocumentPosition = requireDocumentPosition();
		        }
		      }

		      
		      // Sets the parent node of this node and its children recursively

		      // `parent` the parent node
		      setParent(parent) {
		        var child, j, len, ref1, results;
		        this.parent = parent;
		        if (parent) {
		          this.options = parent.options;
		          this.stringify = parent.stringify;
		        }
		        ref1 = this.children;
		        results = [];
		        for (j = 0, len = ref1.length; j < len; j++) {
		          child = ref1[j];
		          results.push(child.setParent(this));
		        }
		        return results;
		      }

		      // Creates a child element node

		      // `name` node name or an object describing the XML tree
		      // `attributes` an object containing name/value pairs of attributes
		      // `text` element text
		      element(name, attributes, text) {
		        var childNode, item, j, k, key, lastChild, len, len1, val;
		        lastChild = null;
		        if (attributes === null && (text == null)) {
		          [attributes, text] = [{}, null];
		        }
		        if (attributes == null) {
		          attributes = {};
		        }
		        attributes = getValue(attributes);
		        // swap argument order: text <-> attributes
		        if (!isObject(attributes)) {
		          [text, attributes] = [attributes, text];
		        }
		        if (name != null) {
		          name = getValue(name);
		        }
		        // expand if array
		        if (Array.isArray(name)) {
		          for (j = 0, len = name.length; j < len; j++) {
		            item = name[j];
		            lastChild = this.element(item);
		          }
		        // evaluate if function
		        } else if (isFunction(name)) {
		          lastChild = this.element(name.apply());
		        // expand if object
		        } else if (isObject(name)) {
		          for (key in name) {
		            if (!hasProp.call(name, key)) continue;
		            val = name[key];
		            if (isFunction(val)) {
		              // evaluate if function
		              val = val.apply();
		            }
		            // assign attributes
		            if (!this.options.ignoreDecorators && this.stringify.convertAttKey && key.indexOf(this.stringify.convertAttKey) === 0) {
		              lastChild = this.attribute(key.substr(this.stringify.convertAttKey.length), val);
		            // skip empty arrays
		            } else if (!this.options.separateArrayItems && Array.isArray(val) && isEmpty(val)) {
		              lastChild = this.dummy();
		            // empty objects produce one node
		            } else if (isObject(val) && isEmpty(val)) {
		              lastChild = this.element(key);
		            // skip null and undefined nodes
		            } else if (!this.options.keepNullNodes && (val == null)) {
		              lastChild = this.dummy();
		            
		            // expand list by creating child nodes
		            } else if (!this.options.separateArrayItems && Array.isArray(val)) {
		              for (k = 0, len1 = val.length; k < len1; k++) {
		                item = val[k];
		                childNode = {};
		                childNode[key] = item;
		                lastChild = this.element(childNode);
		              }
		            
		            // expand child nodes under parent
		            } else if (isObject(val)) {
		              // if the key is #text expand child nodes under this node to support mixed content
		              if (!this.options.ignoreDecorators && this.stringify.convertTextKey && key.indexOf(this.stringify.convertTextKey) === 0) {
		                lastChild = this.element(val);
		              } else {
		                lastChild = this.element(key);
		                lastChild.element(val);
		              }
		            } else {
		              
		              // text node
		              lastChild = this.element(key, val);
		            }
		          }
		        // skip null nodes
		        } else if (!this.options.keepNullNodes && text === null) {
		          lastChild = this.dummy();
		        } else {
		          // text node
		          if (!this.options.ignoreDecorators && this.stringify.convertTextKey && name.indexOf(this.stringify.convertTextKey) === 0) {
		            lastChild = this.text(text);
		          // cdata node
		          } else if (!this.options.ignoreDecorators && this.stringify.convertCDataKey && name.indexOf(this.stringify.convertCDataKey) === 0) {
		            lastChild = this.cdata(text);
		          // comment node
		          } else if (!this.options.ignoreDecorators && this.stringify.convertCommentKey && name.indexOf(this.stringify.convertCommentKey) === 0) {
		            lastChild = this.comment(text);
		          // raw text node
		          } else if (!this.options.ignoreDecorators && this.stringify.convertRawKey && name.indexOf(this.stringify.convertRawKey) === 0) {
		            lastChild = this.raw(text);
		          // processing instruction
		          } else if (!this.options.ignoreDecorators && this.stringify.convertPIKey && name.indexOf(this.stringify.convertPIKey) === 0) {
		            lastChild = this.instruction(name.substr(this.stringify.convertPIKey.length), text);
		          } else {
		            // element node
		            lastChild = this.node(name, attributes, text);
		          }
		        }
		        if (lastChild == null) {
		          throw new Error("Could not create any elements with: " + name + ". " + this.debugInfo());
		        }
		        return lastChild;
		      }

		      // Creates a child element node before the current node

		      // `name` node name or an object describing the XML tree
		      // `attributes` an object containing name/value pairs of attributes
		      // `text` element text
		      insertBefore(name, attributes, text) {
		        var child, i, newChild, refChild, removed;
		        // DOM level 1
		        // insertBefore(newChild, refChild) inserts the child node newChild before refChild
		        if (name != null ? name.type : void 0) {
		          newChild = name;
		          refChild = attributes;
		          newChild.setParent(this);
		          if (refChild) {
		            // temporarily remove children starting *with* refChild
		            i = children.indexOf(refChild);
		            removed = children.splice(i);
		            
		            // add the new child
		            children.push(newChild);
		            
		            // add back removed children after new child
		            Array.prototype.push.apply(children, removed);
		          } else {
		            children.push(newChild);
		          }
		          return newChild;
		        } else {
		          if (this.isRoot) {
		            throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
		          }
		          
		          // temporarily remove children starting *with* this
		          i = this.parent.children.indexOf(this);
		          removed = this.parent.children.splice(i);
		          
		          // add the new child
		          child = this.parent.element(name, attributes, text);
		          
		          // add back removed children after new child
		          Array.prototype.push.apply(this.parent.children, removed);
		          return child;
		        }
		      }

		      // Creates a child element node after the current node

		      // `name` node name or an object describing the XML tree
		      // `attributes` an object containing name/value pairs of attributes
		      // `text` element text
		      insertAfter(name, attributes, text) {
		        var child, i, removed;
		        if (this.isRoot) {
		          throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
		        }
		        
		        // temporarily remove children starting *after* this
		        i = this.parent.children.indexOf(this);
		        removed = this.parent.children.splice(i + 1);
		        
		        // add the new child
		        child = this.parent.element(name, attributes, text);
		        
		        // add back removed children after new child
		        Array.prototype.push.apply(this.parent.children, removed);
		        return child;
		      }

		      // Deletes a child element node

		      remove() {
		        var i;
		        if (this.isRoot) {
		          throw new Error("Cannot remove the root element. " + this.debugInfo());
		        }
		        i = this.parent.children.indexOf(this);
		        splice.apply(this.parent.children, [i, i - i + 1].concat([]));
		        return this.parent;
		      }

		      // Creates a node

		      // `name` name of the node
		      // `attributes` an object containing name/value pairs of attributes
		      // `text` element text
		      node(name, attributes, text) {
		        var child;
		        if (name != null) {
		          name = getValue(name);
		        }
		        attributes || (attributes = {});
		        attributes = getValue(attributes);
		        // swap argument order: text <-> attributes
		        if (!isObject(attributes)) {
		          [text, attributes] = [attributes, text];
		        }
		        child = new XMLElement(this, name, attributes);
		        if (text != null) {
		          child.text(text);
		        }
		        this.children.push(child);
		        return child;
		      }

		      // Creates a text node

		      // `value` element text
		      text(value) {
		        var child;
		        if (isObject(value)) {
		          this.element(value);
		        }
		        child = new XMLText(this, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a CDATA node

		      // `value` element text without CDATA delimiters
		      cdata(value) {
		        var child;
		        child = new XMLCData(this, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a comment node

		      // `value` comment text
		      comment(value) {
		        var child;
		        child = new XMLComment(this, value);
		        this.children.push(child);
		        return this;
		      }

		      // Creates a comment node before the current node

		      // `value` comment text
		      commentBefore(value) {
		        var i, removed;
		        // temporarily remove children starting *with* this
		        i = this.parent.children.indexOf(this);
		        removed = this.parent.children.splice(i);
		        // add the new child
		        this.parent.comment(value);
		        // add back removed children after new child
		        Array.prototype.push.apply(this.parent.children, removed);
		        return this;
		      }

		      // Creates a comment node after the current node

		      // `value` comment text
		      commentAfter(value) {
		        var i, removed;
		        // temporarily remove children starting *after* this
		        i = this.parent.children.indexOf(this);
		        removed = this.parent.children.splice(i + 1);
		        // add the new child
		        this.parent.comment(value);
		        // add back removed children after new child
		        Array.prototype.push.apply(this.parent.children, removed);
		        return this;
		      }

		      // Adds unescaped raw text

		      // `value` text
		      raw(value) {
		        var child;
		        child = new XMLRaw(this, value);
		        this.children.push(child);
		        return this;
		      }

		      // Adds a dummy node
		      dummy() {
		        var child;
		        child = new XMLDummy(this);
		        // Normally when a new node is created it is added to the child node collection.
		        // However, dummy nodes are never added to the XML tree. They are created while
		        // converting JS objects to XML nodes in order not to break the recursive function
		        // chain. They can be thought of as invisible nodes. They can be traversed through
		        // by using prev(), next(), up(), etc. functions but they do not exists in the tree.

		        // @children.push child
		        return child;
		      }

		      // Adds a processing instruction

		      // `target` instruction target
		      // `value` instruction value
		      instruction(target, value) {
		        var insTarget, insValue, instruction, j, len;
		        if (target != null) {
		          target = getValue(target);
		        }
		        if (value != null) {
		          value = getValue(value);
		        }
		        if (Array.isArray(target)) { // expand if array
		          for (j = 0, len = target.length; j < len; j++) {
		            insTarget = target[j];
		            this.instruction(insTarget);
		          }
		        } else if (isObject(target)) { // expand if object
		          for (insTarget in target) {
		            if (!hasProp.call(target, insTarget)) continue;
		            insValue = target[insTarget];
		            this.instruction(insTarget, insValue);
		          }
		        } else {
		          if (isFunction(value)) {
		            value = value.apply();
		          }
		          instruction = new XMLProcessingInstruction(this, target, value);
		          this.children.push(instruction);
		        }
		        return this;
		      }

		      // Creates a processing instruction node before the current node

		      // `target` instruction target
		      // `value` instruction value
		      instructionBefore(target, value) {
		        var i, removed;
		        // temporarily remove children starting *with* this
		        i = this.parent.children.indexOf(this);
		        removed = this.parent.children.splice(i);
		        // add the new child
		        this.parent.instruction(target, value);
		        // add back removed children after new child
		        Array.prototype.push.apply(this.parent.children, removed);
		        return this;
		      }

		      // Creates a processing instruction node after the current node

		      // `target` instruction target
		      // `value` instruction value
		      instructionAfter(target, value) {
		        var i, removed;
		        // temporarily remove children starting *after* this
		        i = this.parent.children.indexOf(this);
		        removed = this.parent.children.splice(i + 1);
		        // add the new child
		        this.parent.instruction(target, value);
		        // add back removed children after new child
		        Array.prototype.push.apply(this.parent.children, removed);
		        return this;
		      }

		      // Creates the xml declaration

		      // `version` A version number string, e.g. 1.0
		      // `encoding` Encoding declaration, e.g. UTF-8
		      // `standalone` standalone document declaration: true or false
		      declaration(version, encoding, standalone) {
		        var doc, xmldec;
		        doc = this.document();
		        xmldec = new XMLDeclaration(doc, version, encoding, standalone);
		        // Replace XML declaration if exists, otherwise insert at top
		        if (doc.children.length === 0) {
		          doc.children.unshift(xmldec);
		        } else if (doc.children[0].type === NodeType.Declaration) {
		          doc.children[0] = xmldec;
		        } else {
		          doc.children.unshift(xmldec);
		        }
		        return doc.root() || doc;
		      }

		      // Creates the document type declaration

		      // `pubID` the public identifier of the external subset
		      // `sysID` the system identifier of the external subset
		      dtd(pubID, sysID) {
		        var child, doc, doctype, i, j, k, len, len1, ref1, ref2;
		        doc = this.document();
		        doctype = new XMLDocType(doc, pubID, sysID);
		        ref1 = doc.children;
		        // Replace DTD if exists
		        for (i = j = 0, len = ref1.length; j < len; i = ++j) {
		          child = ref1[i];
		          if (child.type === NodeType.DocType) {
		            doc.children[i] = doctype;
		            return doctype;
		          }
		        }
		        ref2 = doc.children;
		        // insert before root node if the root node exists
		        for (i = k = 0, len1 = ref2.length; k < len1; i = ++k) {
		          child = ref2[i];
		          if (child.isRoot) {
		            doc.children.splice(i, 0, doctype);
		            return doctype;
		          }
		        }
		        // otherwise append to end
		        doc.children.push(doctype);
		        return doctype;
		      }

		      // Gets the parent node
		      up() {
		        if (this.isRoot) {
		          throw new Error("The root node has no parent. Use doc() if you need to get the document object.");
		        }
		        return this.parent;
		      }

		      // Gets the root node
		      root() {
		        var node;
		        node = this;
		        while (node) {
		          if (node.type === NodeType.Document) {
		            return node.rootObject;
		          } else if (node.isRoot) {
		            return node;
		          } else {
		            node = node.parent;
		          }
		        }
		      }

		      // Gets the node representing the XML document
		      document() {
		        var node;
		        node = this;
		        while (node) {
		          if (node.type === NodeType.Document) {
		            return node;
		          } else {
		            node = node.parent;
		          }
		        }
		      }

		      // Ends the document and converts string
		      end(options) {
		        return this.document().end(options);
		      }

		      // Gets the previous node
		      prev() {
		        var i;
		        i = this.parent.children.indexOf(this);
		        if (i < 1) {
		          throw new Error("Already at the first node. " + this.debugInfo());
		        }
		        return this.parent.children[i - 1];
		      }

		      // Gets the next node
		      next() {
		        var i;
		        i = this.parent.children.indexOf(this);
		        if (i === -1 || i === this.parent.children.length - 1) {
		          throw new Error("Already at the last node. " + this.debugInfo());
		        }
		        return this.parent.children[i + 1];
		      }

		      // Imports cloned root from another XML document

		      // `doc` the XML document to insert nodes from
		      importDocument(doc) {
		        var child, clonedRoot, j, len, ref1;
		        clonedRoot = doc.root().clone();
		        clonedRoot.parent = this;
		        clonedRoot.isRoot = false;
		        this.children.push(clonedRoot);
		        // set properties if imported element becomes the root node
		        if (this.type === NodeType.Document) {
		          clonedRoot.isRoot = true;
		          clonedRoot.documentObject = this;
		          this.rootObject = clonedRoot;
		          // set dtd name
		          if (this.children) {
		            ref1 = this.children;
		            for (j = 0, len = ref1.length; j < len; j++) {
		              child = ref1[j];
		              if (child.type === NodeType.DocType) {
		                child.name = clonedRoot.name;
		                break;
		              }
		            }
		          }
		        }
		        return this;
		      }

		      
		      // Returns debug string for this node
		      debugInfo(name) {
		        var ref1, ref2;
		        name = name || this.name;
		        if ((name == null) && !((ref1 = this.parent) != null ? ref1.name : void 0)) {
		          return "";
		        } else if (name == null) {
		          return "parent: <" + this.parent.name + ">";
		        } else if (!((ref2 = this.parent) != null ? ref2.name : void 0)) {
		          return "node: <" + name + ">";
		        } else {
		          return "node: <" + name + ">, parent: <" + this.parent.name + ">";
		        }
		      }

		      // Aliases
		      ele(name, attributes, text) {
		        return this.element(name, attributes, text);
		      }

		      nod(name, attributes, text) {
		        return this.node(name, attributes, text);
		      }

		      txt(value) {
		        return this.text(value);
		      }

		      dat(value) {
		        return this.cdata(value);
		      }

		      com(value) {
		        return this.comment(value);
		      }

		      ins(target, value) {
		        return this.instruction(target, value);
		      }

		      doc() {
		        return this.document();
		      }

		      dec(version, encoding, standalone) {
		        return this.declaration(version, encoding, standalone);
		      }

		      e(name, attributes, text) {
		        return this.element(name, attributes, text);
		      }

		      n(name, attributes, text) {
		        return this.node(name, attributes, text);
		      }

		      t(value) {
		        return this.text(value);
		      }

		      d(value) {
		        return this.cdata(value);
		      }

		      c(value) {
		        return this.comment(value);
		      }

		      r(value) {
		        return this.raw(value);
		      }

		      i(target, value) {
		        return this.instruction(target, value);
		      }

		      u() {
		        return this.up();
		      }

		      // can be deprecated in a future release
		      importXMLBuilder(doc) {
		        return this.importDocument(doc);
		      }

		      // Adds or modifies an attribute.

		      // `name` attribute name
		      // `value` attribute value
		      attribute(name, value) {
		        throw new Error("attribute() applies to element nodes only.");
		      }

		      att(name, value) {
		        return this.attribute(name, value);
		      }

		      a(name, value) {
		        return this.attribute(name, value);
		      }

		      // Removes an attribute

		      // `name` attribute name
		      removeAttribute(name) {
		        throw new Error("attribute() applies to element nodes only.");
		      }

		      // DOM level 1 functions to be implemented later
		      replaceChild(newChild, oldChild) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      removeChild(oldChild) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      appendChild(newChild) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      hasChildNodes() {
		        return this.children.length !== 0;
		      }

		      cloneNode(deep) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      normalize() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM level 2
		      isSupported(feature, version) {
		        return true;
		      }

		      hasAttributes() {
		        return this.attribs.length !== 0;
		      }

		      // DOM level 3 functions to be implemented later
		      compareDocumentPosition(other) {
		        var ref, res;
		        ref = this;
		        if (ref === other) {
		          return 0;
		        } else if (this.document() !== other.document()) {
		          res = DocumentPosition.Disconnected | DocumentPosition.ImplementationSpecific;
		          if (Math.random() < 0.5) {
		            res |= DocumentPosition.Preceding;
		          } else {
		            res |= DocumentPosition.Following;
		          }
		          return res;
		        } else if (ref.isAncestor(other)) {
		          return DocumentPosition.Contains | DocumentPosition.Preceding;
		        } else if (ref.isDescendant(other)) {
		          return DocumentPosition.Contains | DocumentPosition.Following;
		        } else if (ref.isPreceding(other)) {
		          return DocumentPosition.Preceding;
		        } else {
		          return DocumentPosition.Following;
		        }
		      }

		      isSameNode(other) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      lookupPrefix(namespaceURI) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      isDefaultNamespace(namespaceURI) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      lookupNamespaceURI(prefix) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      isEqualNode(node) {
		        var i, j, ref1;
		        if (node.nodeType !== this.nodeType) {
		          return false;
		        }
		        if (node.children.length !== this.children.length) {
		          return false;
		        }
		        for (i = j = 0, ref1 = this.children.length - 1; (0 <= ref1 ? j <= ref1 : j >= ref1); i = 0 <= ref1 ? ++j : --j) {
		          if (!this.children[i].isEqualNode(node.children[i])) {
		            return false;
		          }
		        }
		        return true;
		      }

		      getFeature(feature, version) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      setUserData(key, data, handler) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getUserData(key) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // Returns true if other is an inclusive descendant of node,
		      // and false otherwise.
		      contains(other) {
		        if (!other) {
		          return false;
		        }
		        return other === this || this.isDescendant(other);
		      }

		      // An object A is called a descendant of an object B, if either A is 
		      // a child of B or A is a child of an object C that is a descendant of B.
		      isDescendant(node) {
		        var child, isDescendantChild, j, len, ref1;
		        ref1 = this.children;
		        for (j = 0, len = ref1.length; j < len; j++) {
		          child = ref1[j];
		          if (node === child) {
		            return true;
		          }
		          isDescendantChild = child.isDescendant(node);
		          if (isDescendantChild) {
		            return true;
		          }
		        }
		        return false;
		      }

		      // An object A is called an ancestor of an object B if and only if
		      // B is a descendant of A.
		      isAncestor(node) {
		        return node.isDescendant(this);
		      }

		      // An object A is preceding an object B if A and B are in the 
		      // same tree and A comes before B in tree order.
		      isPreceding(node) {
		        var nodePos, thisPos;
		        nodePos = this.treePosition(node);
		        thisPos = this.treePosition(this);
		        if (nodePos === -1 || thisPos === -1) {
		          return false;
		        } else {
		          return nodePos < thisPos;
		        }
		      }

		      // An object A is folllowing an object B if A and B are in the 
		      // same tree and A comes after B in tree order.
		      isFollowing(node) {
		        var nodePos, thisPos;
		        nodePos = this.treePosition(node);
		        thisPos = this.treePosition(this);
		        if (nodePos === -1 || thisPos === -1) {
		          return false;
		        } else {
		          return nodePos > thisPos;
		        }
		      }

		      // Returns the preorder position of the given node in the tree, or -1
		      // if the node is not in the tree.
		      treePosition(node) {
		        var found, pos;
		        pos = 0;
		        found = false;
		        this.foreachTreeNode(this.document(), function(childNode) {
		          pos++;
		          if (!found && childNode === node) {
		            return found = true;
		          }
		        });
		        if (found) {
		          return pos;
		        } else {
		          return -1;
		        }
		      }

		      
		      // Depth-first preorder traversal through the XML tree
		      foreachTreeNode(node, func) {
		        var child, j, len, ref1, res;
		        node || (node = this.document());
		        ref1 = node.children;
		        for (j = 0, len = ref1.length; j < len; j++) {
		          child = ref1[j];
		          if (res = func(child)) {
		            return res;
		          } else {
		            res = this.foreachTreeNode(child, func);
		            if (res) {
		              return res;
		            }
		          }
		        }
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLNode.prototype, 'nodeName', {
		      get: function() {
		        return this.name;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'nodeType', {
		      get: function() {
		        return this.type;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'nodeValue', {
		      get: function() {
		        return this.value;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'parentNode', {
		      get: function() {
		        return this.parent;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'childNodes', {
		      get: function() {
		        if (!this.childNodeList || !this.childNodeList.nodes) {
		          this.childNodeList = new XMLNodeList(this.children);
		        }
		        return this.childNodeList;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'firstChild', {
		      get: function() {
		        return this.children[0] || null;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'lastChild', {
		      get: function() {
		        return this.children[this.children.length - 1] || null;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'previousSibling', {
		      get: function() {
		        var i;
		        i = this.parent.children.indexOf(this);
		        return this.parent.children[i - 1] || null;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'nextSibling', {
		      get: function() {
		        var i;
		        i = this.parent.children.indexOf(this);
		        return this.parent.children[i + 1] || null;
		      }
		    });

		    Object.defineProperty(XMLNode.prototype, 'ownerDocument', {
		      get: function() {
		        return this.document() || null;
		      }
		    });

		    // DOM level 3
		    Object.defineProperty(XMLNode.prototype, 'textContent', {
		      get: function() {
		        var child, j, len, ref1, str;
		        if (this.nodeType === NodeType.Element || this.nodeType === NodeType.DocumentFragment) {
		          str = '';
		          ref1 = this.children;
		          for (j = 0, len = ref1.length; j < len; j++) {
		            child = ref1[j];
		            if (child.textContent) {
		              str += child.textContent;
		            }
		          }
		          return str;
		        } else {
		          return null;
		        }
		      },
		      set: function(value) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }
		    });

		    return XMLNode;

		  }).call(this);

		}).call(XMLNode);
		return XMLNode$1.exports;
	}

	var XMLStringifier$1 = {exports: {}};

	var XMLStringifier = XMLStringifier$1.exports;

	var hasRequiredXMLStringifier;

	function requireXMLStringifier () {
		if (hasRequiredXMLStringifier) return XMLStringifier$1.exports;
		hasRequiredXMLStringifier = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  // Converts values to strings
		  var hasProp = {}.hasOwnProperty;

		  XMLStringifier$1.exports = (function() {
		    class XMLStringifier {
		      // Initializes a new instance of `XMLStringifier`

		      // `options.version` The version number string of the XML spec to validate against, e.g. 1.0
		      // `options.noDoubleEncoding` whether existing html entities are encoded: true or false
		      // `options.stringify` a set of functions to use for converting values to strings
		      // `options.noValidation` whether values will be validated and escaped or returned as is
		      // `options.invalidCharReplacement` a character to replace invalid characters and disable character validation
		      constructor(options) {
		        var key, ref, value;
		        // Checks whether the given string contains legal characters
		        // Fails with an exception on error

		        // `str` the string to check
		        this.assertLegalChar = this.assertLegalChar.bind(this);
		        // Checks whether the given string contains legal characters for a name
		        // Fails with an exception on error

		        // `str` the string to check
		        this.assertLegalName = this.assertLegalName.bind(this);
		        options || (options = {});
		        this.options = options;
		        if (!this.options.version) {
		          this.options.version = '1.0';
		        }
		        ref = options.stringify || {};
		        for (key in ref) {
		          if (!hasProp.call(ref, key)) continue;
		          value = ref[key];
		          this[key] = value;
		        }
		      }

		      // Defaults
		      name(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalName('' + val || '');
		      }

		      text(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar(this.textEscape('' + val || ''));
		      }

		      cdata(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        val = '' + val || '';
		        val = val.replace(']]>', ']]]]><![CDATA[>');
		        return this.assertLegalChar(val);
		      }

		      comment(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        val = '' + val || '';
		        if (val.match(/--/)) {
		          throw new Error("Comment text cannot contain double-hypen: " + val);
		        }
		        return this.assertLegalChar(val);
		      }

		      raw(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return '' + val || '';
		      }

		      attValue(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar(this.attEscape(val = '' + val || ''));
		      }

		      insTarget(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      insValue(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        val = '' + val || '';
		        if (val.match(/\?>/)) {
		          throw new Error("Invalid processing instruction value: " + val);
		        }
		        return this.assertLegalChar(val);
		      }

		      xmlVersion(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        val = '' + val || '';
		        if (!val.match(/1\.[0-9]+/)) {
		          throw new Error("Invalid version number: " + val);
		        }
		        return val;
		      }

		      xmlEncoding(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        val = '' + val || '';
		        if (!val.match(/^[A-Za-z](?:[A-Za-z0-9._-])*$/)) {
		          throw new Error("Invalid encoding: " + val);
		        }
		        return this.assertLegalChar(val);
		      }

		      xmlStandalone(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        if (val) {
		          return "yes";
		        } else {
		          return "no";
		        }
		      }

		      dtdPubID(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdSysID(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdElementValue(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdAttType(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdAttDefault(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdEntityValue(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      dtdNData(val) {
		        if (this.options.noValidation) {
		          return val;
		        }
		        return this.assertLegalChar('' + val || '');
		      }

		      assertLegalChar(str) {
		        var regex, res;
		        if (this.options.noValidation) {
		          return str;
		        }
		        if (this.options.version === '1.0') {
		          // Valid characters from https://www.w3.org/TR/xml/#charsets
		          // any Unicode character, excluding the surrogate blocks, FFFE, and FFFF.
		          // #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
		          // This ES5 compatible Regexp has been generated using the "regenerate" NPM module:
		          //   let xml_10_InvalidChars = regenerate()
		          //     .addRange(0x0000, 0x0008)
		          //     .add(0x000B, 0x000C)
		          //     .addRange(0x000E, 0x001F)
		          //     .addRange(0xD800, 0xDFFF)
		          //     .addRange(0xFFFE, 0xFFFF)
		          regex = /[\0-\x08\x0B\f\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
		          if (this.options.invalidCharReplacement !== void 0) {
		            str = str.replace(regex, this.options.invalidCharReplacement);
		          } else if (res = str.match(regex)) {
		            throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
		          }
		        } else if (this.options.version === '1.1') {
		          // Valid characters from https://www.w3.org/TR/xml11/#charsets
		          // any Unicode character, excluding the surrogate blocks, FFFE, and FFFF.
		          // [#x1-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
		          // This ES5 compatible Regexp has been generated using the "regenerate" NPM module:
		          //   let xml_11_InvalidChars = regenerate()
		          //     .add(0x0000)
		          //     .addRange(0xD800, 0xDFFF)
		          //     .addRange(0xFFFE, 0xFFFF)
		          regex = /[\0\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
		          if (this.options.invalidCharReplacement !== void 0) {
		            str = str.replace(regex, this.options.invalidCharReplacement);
		          } else if (res = str.match(regex)) {
		            throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
		          }
		        }
		        return str;
		      }

		      assertLegalName(str) {
		        var regex;
		        if (this.options.noValidation) {
		          return str;
		        }
		        str = this.assertLegalChar(str);
		        regex = /^([:A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])([\x2D\.0-:A-Z_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*$/;
		        if (!str.match(regex)) {
		          throw new Error(`Invalid character in name: ${str}`);
		        }
		        return str;
		      }

		      // Escapes special characters in text

		      // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping

		      // `str` the string to escape
		      textEscape(str) {
		        var ampregex;
		        if (this.options.noValidation) {
		          return str;
		        }
		        ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
		        return str.replace(ampregex, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
		      }

		      // Escapes special characters in attribute values

		      // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping

		      // `str` the string to escape
		      attEscape(str) {
		        var ampregex;
		        if (this.options.noValidation) {
		          return str;
		        }
		        ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
		        return str.replace(ampregex, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
		      }

		    }
		    // strings to match while converting from JS objects
		    XMLStringifier.prototype.convertAttKey = '@';

		    XMLStringifier.prototype.convertPIKey = '?';

		    XMLStringifier.prototype.convertTextKey = '#text';

		    XMLStringifier.prototype.convertCDataKey = '#cdata';

		    XMLStringifier.prototype.convertCommentKey = '#comment';

		    XMLStringifier.prototype.convertRawKey = '#raw';

		    return XMLStringifier;

		  }).call(this);

		}).call(XMLStringifier);
		return XMLStringifier$1.exports;
	}

	var XMLStringWriter$1 = {exports: {}};

	var XMLWriterBase$1 = {exports: {}};

	var WriterState$1 = {exports: {}};

	var WriterState = WriterState$1.exports;

	var hasRequiredWriterState;

	function requireWriterState () {
		if (hasRequiredWriterState) return WriterState$1.exports;
		hasRequiredWriterState = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  WriterState$1.exports = {
		    None: 0,
		    OpenTag: 1,
		    InsideTag: 2,
		    CloseTag: 3
		  };

		}).call(WriterState);
		return WriterState$1.exports;
	}

	var XMLWriterBase = XMLWriterBase$1.exports;

	var hasRequiredXMLWriterBase;

	function requireXMLWriterBase () {
		if (hasRequiredXMLWriterBase) return XMLWriterBase$1.exports;
		hasRequiredXMLWriterBase = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, WriterState, assign,
		    hasProp = {}.hasOwnProperty;

		  ({assign} = requireUtility());

		  NodeType = requireNodeType();

		  requireXMLDeclaration();

		  requireXMLDocType();

		  requireXMLCData();

		  requireXMLComment();

		  requireXMLElement();

		  requireXMLRaw();

		  requireXMLText();

		  requireXMLProcessingInstruction();

		  requireXMLDummy();

		  requireXMLDTDAttList();

		  requireXMLDTDElement();

		  requireXMLDTDEntity();

		  requireXMLDTDNotation();

		  WriterState = requireWriterState();

		  // Base class for XML writers
		  XMLWriterBase$1.exports = class XMLWriterBase {
		    // Initializes a new instance of `XMLWriterBase`

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation string
		    // `options.newline` newline sequence
		    // `options.offset` a fixed number of indentations to add to every line
		    // `options.width` maximum column width
		    // `options.allowEmpty` do not self close empty element tags
		    // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
		    // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
		    constructor(options) {
		      var key, ref, value;
		      options || (options = {});
		      this.options = options;
		      ref = options.writer || {};
		      for (key in ref) {
		        if (!hasProp.call(ref, key)) continue;
		        value = ref[key];
		        this["_" + key] = this[key];
		        this[key] = value;
		      }
		    }

		    // Filters writer options and provides defaults

		    // `options` writer options
		    filterOptions(options) {
		      var filteredOptions, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7;
		      options || (options = {});
		      options = assign({}, this.options, options);
		      filteredOptions = {
		        writer: this
		      };
		      filteredOptions.pretty = options.pretty || false;
		      filteredOptions.allowEmpty = options.allowEmpty || false;
		      filteredOptions.indent = (ref = options.indent) != null ? ref : '  ';
		      filteredOptions.newline = (ref1 = options.newline) != null ? ref1 : '\n';
		      filteredOptions.offset = (ref2 = options.offset) != null ? ref2 : 0;
		      filteredOptions.width = (ref3 = options.width) != null ? ref3 : 0;
		      filteredOptions.dontPrettyTextNodes = (ref4 = (ref5 = options.dontPrettyTextNodes) != null ? ref5 : options.dontprettytextnodes) != null ? ref4 : 0;
		      filteredOptions.spaceBeforeSlash = (ref6 = (ref7 = options.spaceBeforeSlash) != null ? ref7 : options.spacebeforeslash) != null ? ref6 : '';
		      if (filteredOptions.spaceBeforeSlash === true) {
		        filteredOptions.spaceBeforeSlash = ' ';
		      }
		      filteredOptions.suppressPrettyCount = 0;
		      filteredOptions.user = {};
		      filteredOptions.state = WriterState.None;
		      return filteredOptions;
		    }

		    // Returns the indentation string for the current level

		    // `node` current node
		    // `options` writer options
		    // `level` current indentation level
		    indent(node, options, level) {
		      var indentLevel;
		      if (!options.pretty || options.suppressPrettyCount) {
		        return '';
		      } else if (options.pretty) {
		        indentLevel = (level || 0) + options.offset + 1;
		        if (indentLevel > 0) {
		          return new Array(indentLevel).join(options.indent);
		        }
		      }
		      return '';
		    }

		    // Returns the newline string

		    // `node` current node
		    // `options` writer options
		    // `level` current indentation level
		    endline(node, options, level) {
		      if (!options.pretty || options.suppressPrettyCount) {
		        return '';
		      } else {
		        return options.newline;
		      }
		    }

		    attribute(att, options, level) {
		      var r;
		      this.openAttribute(att, options, level);
		      if (options.pretty && options.width > 0) {
		        r = att.name + '="' + att.value + '"';
		      } else {
		        r = ' ' + att.name + '="' + att.value + '"';
		      }
		      this.closeAttribute(att, options, level);
		      return r;
		    }

		    cdata(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<![CDATA[';
		      options.state = WriterState.InsideTag;
		      r += node.value;
		      options.state = WriterState.CloseTag;
		      r += ']]>' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    comment(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<!-- ';
		      options.state = WriterState.InsideTag;
		      r += node.value;
		      options.state = WriterState.CloseTag;
		      r += ' -->' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    declaration(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<?xml';
		      options.state = WriterState.InsideTag;
		      r += ' version="' + node.version + '"';
		      if (node.encoding != null) {
		        r += ' encoding="' + node.encoding + '"';
		      }
		      if (node.standalone != null) {
		        r += ' standalone="' + node.standalone + '"';
		      }
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '?>';
		      r += this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    docType(node, options, level) {
		      var child, i, len1, r, ref;
		      level || (level = 0);
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level);
		      r += '<!DOCTYPE ' + node.root().name;
		      // external identifier
		      if (node.pubID && node.sysID) {
		        r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
		      } else if (node.sysID) {
		        r += ' SYSTEM "' + node.sysID + '"';
		      }
		      // internal subset
		      if (node.children.length > 0) {
		        r += ' [';
		        r += this.endline(node, options, level);
		        options.state = WriterState.InsideTag;
		        ref = node.children;
		        for (i = 0, len1 = ref.length; i < len1; i++) {
		          child = ref[i];
		          r += this.writeChildNode(child, options, level + 1);
		        }
		        options.state = WriterState.CloseTag;
		        r += ']';
		      }
		      // close tag
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '>';
		      r += this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    element(node, options, level) {
		      var att, attLen, child, childNodeCount, firstChildNode, i, j, len, len1, len2, name, prettySuppressed, r, ratt, ref, ref1, ref2, ref3, rline;
		      level || (level = 0);
		      prettySuppressed = false;
		      // open tag
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<' + node.name;
		      // attributes
		      if (options.pretty && options.width > 0) {
		        len = r.length;
		        ref = node.attribs;
		        for (name in ref) {
		          if (!hasProp.call(ref, name)) continue;
		          att = ref[name];
		          ratt = this.attribute(att, options, level);
		          attLen = ratt.length;
		          if (len + attLen > options.width) {
		            rline = this.indent(node, options, level + 1) + ratt;
		            r += this.endline(node, options, level) + rline;
		            len = rline.length;
		          } else {
		            rline = ' ' + ratt;
		            r += rline;
		            len += rline.length;
		          }
		        }
		      } else {
		        ref1 = node.attribs;
		        for (name in ref1) {
		          if (!hasProp.call(ref1, name)) continue;
		          att = ref1[name];
		          r += this.attribute(att, options, level);
		        }
		      }
		      childNodeCount = node.children.length;
		      firstChildNode = childNodeCount === 0 ? null : node.children[0];
		      if (childNodeCount === 0 || node.children.every(function(e) {
		        return (e.type === NodeType.Text || e.type === NodeType.Raw || e.type === NodeType.CData) && e.value === '';
		      })) {
		        // empty element
		        if (options.allowEmpty) {
		          r += '>';
		          options.state = WriterState.CloseTag;
		          r += '</' + node.name + '>' + this.endline(node, options, level);
		        } else {
		          options.state = WriterState.CloseTag;
		          r += options.spaceBeforeSlash + '/>' + this.endline(node, options, level);
		        }
		      } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw || firstChildNode.type === NodeType.CData) && (firstChildNode.value != null)) {
		        // do not indent text-only nodes
		        r += '>';
		        options.state = WriterState.InsideTag;
		        options.suppressPrettyCount++;
		        prettySuppressed = true;
		        r += this.writeChildNode(firstChildNode, options, level + 1);
		        options.suppressPrettyCount--;
		        prettySuppressed = false;
		        options.state = WriterState.CloseTag;
		        r += '</' + node.name + '>' + this.endline(node, options, level);
		      } else {
		        // if ANY are a text node, then suppress pretty now
		        if (options.dontPrettyTextNodes) {
		          ref2 = node.children;
		          for (i = 0, len1 = ref2.length; i < len1; i++) {
		            child = ref2[i];
		            if ((child.type === NodeType.Text || child.type === NodeType.Raw || child.type === NodeType.CData) && (child.value != null)) {
		              options.suppressPrettyCount++;
		              prettySuppressed = true;
		              break;
		            }
		          }
		        }
		        // close the opening tag, after dealing with newline
		        r += '>' + this.endline(node, options, level);
		        options.state = WriterState.InsideTag;
		        ref3 = node.children;
		        // inner tags
		        for (j = 0, len2 = ref3.length; j < len2; j++) {
		          child = ref3[j];
		          r += this.writeChildNode(child, options, level + 1);
		        }
		        // close tag
		        options.state = WriterState.CloseTag;
		        r += this.indent(node, options, level) + '</' + node.name + '>';
		        if (prettySuppressed) {
		          options.suppressPrettyCount--;
		        }
		        r += this.endline(node, options, level);
		        options.state = WriterState.None;
		      }
		      this.closeNode(node, options, level);
		      return r;
		    }

		    writeChildNode(node, options, level) {
		      switch (node.type) {
		        case NodeType.CData:
		          return this.cdata(node, options, level);
		        case NodeType.Comment:
		          return this.comment(node, options, level);
		        case NodeType.Element:
		          return this.element(node, options, level);
		        case NodeType.Raw:
		          return this.raw(node, options, level);
		        case NodeType.Text:
		          return this.text(node, options, level);
		        case NodeType.ProcessingInstruction:
		          return this.processingInstruction(node, options, level);
		        case NodeType.Dummy:
		          return '';
		        case NodeType.Declaration:
		          return this.declaration(node, options, level);
		        case NodeType.DocType:
		          return this.docType(node, options, level);
		        case NodeType.AttributeDeclaration:
		          return this.dtdAttList(node, options, level);
		        case NodeType.ElementDeclaration:
		          return this.dtdElement(node, options, level);
		        case NodeType.EntityDeclaration:
		          return this.dtdEntity(node, options, level);
		        case NodeType.NotationDeclaration:
		          return this.dtdNotation(node, options, level);
		        default:
		          throw new Error("Unknown XML node type: " + node.constructor.name);
		      }
		    }

		    processingInstruction(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<?';
		      options.state = WriterState.InsideTag;
		      r += node.target;
		      if (node.value) {
		        r += ' ' + node.value;
		      }
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '?>';
		      r += this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    raw(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level);
		      options.state = WriterState.InsideTag;
		      r += node.value;
		      options.state = WriterState.CloseTag;
		      r += this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    text(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level);
		      options.state = WriterState.InsideTag;
		      r += node.value;
		      options.state = WriterState.CloseTag;
		      r += this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    dtdAttList(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<!ATTLIST';
		      options.state = WriterState.InsideTag;
		      r += ' ' + node.elementName + ' ' + node.attributeName + ' ' + node.attributeType;
		      if (node.defaultValueType !== '#DEFAULT') {
		        r += ' ' + node.defaultValueType;
		      }
		      if (node.defaultValue) {
		        r += ' "' + node.defaultValue + '"';
		      }
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '>' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    dtdElement(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<!ELEMENT';
		      options.state = WriterState.InsideTag;
		      r += ' ' + node.name + ' ' + node.value;
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '>' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    dtdEntity(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<!ENTITY';
		      options.state = WriterState.InsideTag;
		      if (node.pe) {
		        r += ' %';
		      }
		      r += ' ' + node.name;
		      if (node.value) {
		        r += ' "' + node.value + '"';
		      } else {
		        if (node.pubID && node.sysID) {
		          r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
		        } else if (node.sysID) {
		          r += ' SYSTEM "' + node.sysID + '"';
		        }
		        if (node.nData) {
		          r += ' NDATA ' + node.nData;
		        }
		      }
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '>' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    dtdNotation(node, options, level) {
		      var r;
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<!NOTATION';
		      options.state = WriterState.InsideTag;
		      r += ' ' + node.name;
		      if (node.pubID && node.sysID) {
		        r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
		      } else if (node.pubID) {
		        r += ' PUBLIC "' + node.pubID + '"';
		      } else if (node.sysID) {
		        r += ' SYSTEM "' + node.sysID + '"';
		      }
		      options.state = WriterState.CloseTag;
		      r += options.spaceBeforeSlash + '>' + this.endline(node, options, level);
		      options.state = WriterState.None;
		      this.closeNode(node, options, level);
		      return r;
		    }

		    openNode(node, options, level) {}

		    closeNode(node, options, level) {}

		    openAttribute(att, options, level) {}

		    closeAttribute(att, options, level) {}

		  };

		}).call(XMLWriterBase);
		return XMLWriterBase$1.exports;
	}

	var XMLStringWriter = XMLStringWriter$1.exports;

	var hasRequiredXMLStringWriter;

	function requireXMLStringWriter () {
		if (hasRequiredXMLStringWriter) return XMLStringWriter$1.exports;
		hasRequiredXMLStringWriter = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var XMLWriterBase;

		  XMLWriterBase = requireXMLWriterBase();

		  // Prints XML nodes as plain text
		  XMLStringWriter$1.exports = class XMLStringWriter extends XMLWriterBase {
		    // Initializes a new instance of `XMLStringWriter`

		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation string
		    // `options.newline` newline sequence
		    // `options.offset` a fixed number of indentations to add to every line
		    // `options.allowEmpty` do not self close empty element tags
		    // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
		    // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
		    constructor(options) {
		      super(options);
		    }

		    document(doc, options) {
		      var child, i, len, r, ref;
		      options = this.filterOptions(options);
		      r = '';
		      ref = doc.children;
		      for (i = 0, len = ref.length; i < len; i++) {
		        child = ref[i];
		        r += this.writeChildNode(child, options, 0);
		      }
		      // remove trailing newline
		      if (options.pretty && r.slice(-options.newline.length) === options.newline) {
		        r = r.slice(0, -options.newline.length);
		      }
		      return r;
		    }

		  };

		}).call(XMLStringWriter);
		return XMLStringWriter$1.exports;
	}

	var XMLDocument = XMLDocument$1.exports;

	var hasRequiredXMLDocument;

	function requireXMLDocument () {
		if (hasRequiredXMLDocument) return XMLDocument$1.exports;
		hasRequiredXMLDocument = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, XMLDOMConfiguration, XMLDOMImplementation, XMLNode, XMLStringWriter, XMLStringifier, isPlainObject;

		  ({isPlainObject} = requireUtility());

		  XMLDOMImplementation = requireXMLDOMImplementation();

		  XMLDOMConfiguration = requireXMLDOMConfiguration();

		  XMLNode = requireXMLNode();

		  NodeType = requireNodeType();

		  XMLStringifier = requireXMLStringifier();

		  XMLStringWriter = requireXMLStringWriter();

		  // Represents an XML builder
		  XMLDocument$1.exports = (function() {
		    class XMLDocument extends XMLNode {
		      // Initializes a new instance of `XMLDocument`

		      // `options.keepNullNodes` whether nodes with null values will be kept
		      //     or ignored: true or false
		      // `options.keepNullAttributes` whether attributes with null values will be
		      //     kept or ignored: true or false
		      // `options.ignoreDecorators` whether decorator strings will be ignored when
		      //     converting JS objects: true or false
		      // `options.separateArrayItems` whether array items are created as separate
		      //     nodes when passed as an object value: true or false
		      // `options.noDoubleEncoding` whether existing html entities are encoded:
		      //     true or false
		      // `options.stringify` a set of functions to use for converting values to
		      //     strings
		      // `options.writer` the default XML writer to use for converting nodes to
		      //     string. If the default writer is not set, the built-in XMLStringWriter
		      //     will be used instead.
		      constructor(options) {
		        super(null);
		        this.name = "#document";
		        this.type = NodeType.Document;
		        this.documentURI = null;
		        this.domConfig = new XMLDOMConfiguration();
		        options || (options = {});
		        if (!options.writer) {
		          options.writer = new XMLStringWriter();
		        }
		        this.options = options;
		        this.stringify = new XMLStringifier(options);
		      }

		      // Ends the document and passes it to the given XML writer

		      // `writer` is either an XML writer or a plain object to pass to the
		      // constructor of the default XML writer. The default writer is assigned when
		      // creating the XML document. Following flags are recognized by the
		      // built-in XMLStringWriter:
		      //   `writer.pretty` pretty prints the result
		      //   `writer.indent` indentation for pretty print
		      //   `writer.offset` how many indentations to add to every line for pretty print
		      //   `writer.newline` newline sequence for pretty print
		      end(writer) {
		        var writerOptions;
		        writerOptions = {};
		        if (!writer) {
		          writer = this.options.writer;
		        } else if (isPlainObject(writer)) {
		          writerOptions = writer;
		          writer = this.options.writer;
		        }
		        return writer.document(this, writer.filterOptions(writerOptions));
		      }

		      // Converts the XML document to string

		      // `options.pretty` pretty prints the result
		      // `options.indent` indentation for pretty print
		      // `options.offset` how many indentations to add to every line for pretty print
		      // `options.newline` newline sequence for pretty print
		      toString(options) {
		        return this.options.writer.document(this, this.options.writer.filterOptions(options));
		      }

		      // DOM level 1 functions to be implemented later
		      createElement(tagName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createDocumentFragment() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createTextNode(data) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createComment(data) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createCDATASection(data) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createProcessingInstruction(target, data) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createAttribute(name) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createEntityReference(name) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByTagName(tagname) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM level 2 functions to be implemented later
		      importNode(importedNode, deep) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createElementNS(namespaceURI, qualifiedName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createAttributeNS(namespaceURI, qualifiedName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementsByTagNameNS(namespaceURI, localName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      getElementById(elementId) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM level 3 functions to be implemented later
		      adoptNode(source) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      normalizeDocument() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      renameNode(node, namespaceURI, qualifiedName) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      // DOM level 4 functions to be implemented later
		      getElementsByClassName(classNames) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createEvent(eventInterface) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createRange() {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createNodeIterator(root, whatToShow, filter) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		      createTreeWalker(root, whatToShow, filter) {
		        throw new Error("This DOM method is not implemented." + this.debugInfo());
		      }

		    }
		    // DOM level 1
		    Object.defineProperty(XMLDocument.prototype, 'implementation', {
		      value: new XMLDOMImplementation()
		    });

		    Object.defineProperty(XMLDocument.prototype, 'doctype', {
		      get: function() {
		        var child, i, len, ref;
		        ref = this.children;
		        for (i = 0, len = ref.length; i < len; i++) {
		          child = ref[i];
		          if (child.type === NodeType.DocType) {
		            return child;
		          }
		        }
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'documentElement', {
		      get: function() {
		        return this.rootObject || null;
		      }
		    });

		    // DOM level 3
		    Object.defineProperty(XMLDocument.prototype, 'inputEncoding', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'strictErrorChecking', {
		      get: function() {
		        return false;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'xmlEncoding', {
		      get: function() {
		        if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
		          return this.children[0].encoding;
		        } else {
		          return null;
		        }
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'xmlStandalone', {
		      get: function() {
		        if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
		          return this.children[0].standalone === 'yes';
		        } else {
		          return false;
		        }
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'xmlVersion', {
		      get: function() {
		        if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
		          return this.children[0].version;
		        } else {
		          return "1.0";
		        }
		      }
		    });

		    // DOM level 4
		    Object.defineProperty(XMLDocument.prototype, 'URL', {
		      get: function() {
		        return this.documentURI;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'origin', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'compatMode', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'characterSet', {
		      get: function() {
		        return null;
		      }
		    });

		    Object.defineProperty(XMLDocument.prototype, 'contentType', {
		      get: function() {
		        return null;
		      }
		    });

		    return XMLDocument;

		  }).call(this);

		}).call(XMLDocument);
		return XMLDocument$1.exports;
	}

	var XMLDocumentCB$1 = {exports: {}};

	var XMLDocumentCB = XMLDocumentCB$1.exports;

	var hasRequiredXMLDocumentCB;

	function requireXMLDocumentCB () {
		if (hasRequiredXMLDocumentCB) return XMLDocumentCB$1.exports;
		hasRequiredXMLDocumentCB = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, WriterState, XMLAttribute, XMLCData, XMLComment, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDeclaration, XMLDocType, XMLDocument, XMLElement, XMLProcessingInstruction, XMLRaw, XMLStringWriter, XMLStringifier, XMLText, getValue, isFunction, isObject, isPlainObject,
		    hasProp = {}.hasOwnProperty;

		  ({isObject, isFunction, isPlainObject, getValue} = requireUtility());

		  NodeType = requireNodeType();

		  XMLDocument = requireXMLDocument();

		  XMLElement = requireXMLElement();

		  XMLCData = requireXMLCData();

		  XMLComment = requireXMLComment();

		  XMLRaw = requireXMLRaw();

		  XMLText = requireXMLText();

		  XMLProcessingInstruction = requireXMLProcessingInstruction();

		  XMLDeclaration = requireXMLDeclaration();

		  XMLDocType = requireXMLDocType();

		  XMLDTDAttList = requireXMLDTDAttList();

		  XMLDTDEntity = requireXMLDTDEntity();

		  XMLDTDElement = requireXMLDTDElement();

		  XMLDTDNotation = requireXMLDTDNotation();

		  XMLAttribute = requireXMLAttribute();

		  XMLStringifier = requireXMLStringifier();

		  XMLStringWriter = requireXMLStringWriter();

		  WriterState = requireWriterState();

		  // Represents an XML builder
		  XMLDocumentCB$1.exports = class XMLDocumentCB {
		    // Initializes a new instance of `XMLDocumentCB`

		    // `options.keepNullNodes` whether nodes with null values will be kept
		    //     or ignored: true or false
		    // `options.keepNullAttributes` whether attributes with null values will be
		    //     kept or ignored: true or false
		    // `options.ignoreDecorators` whether decorator strings will be ignored when
		    //     converting JS objects: true or false
		    // `options.separateArrayItems` whether array items are created as separate
		    //     nodes when passed as an object value: true or false
		    // `options.noDoubleEncoding` whether existing html entities are encoded:
		    //     true or false
		    // `options.stringify` a set of functions to use for converting values to
		    //     strings
		    // `options.writer` the default XML writer to use for converting nodes to
		    //     string. If the default writer is not set, the built-in XMLStringWriter
		    //     will be used instead.

		    // `onData` the function to be called when a new chunk of XML is output. The
		    //          string containing the XML chunk is passed to `onData` as its first
		    //          argument, and the current indentation level as its second argument.
		    // `onEnd`  the function to be called when the XML document is completed with
		    //          `end`. `onEnd` does not receive any arguments.
		    constructor(options, onData, onEnd) {
		      var writerOptions;
		      this.name = "?xml";
		      this.type = NodeType.Document;
		      options || (options = {});
		      writerOptions = {};
		      if (!options.writer) {
		        options.writer = new XMLStringWriter();
		      } else if (isPlainObject(options.writer)) {
		        writerOptions = options.writer;
		        options.writer = new XMLStringWriter();
		      }
		      this.options = options;
		      this.writer = options.writer;
		      this.writerOptions = this.writer.filterOptions(writerOptions);
		      this.stringify = new XMLStringifier(options);
		      this.onDataCallback = onData || function() {};
		      this.onEndCallback = onEnd || function() {};
		      this.currentNode = null;
		      this.currentLevel = -1;
		      this.openTags = {};
		      this.documentStarted = false;
		      this.documentCompleted = false;
		      this.root = null;
		    }

		    // Creates a child element node from the given XMLNode

		    // `node` the child node
		    createChildNode(node) {
		      var att, attName, attributes, child, i, len, ref, ref1;
		      switch (node.type) {
		        case NodeType.CData:
		          this.cdata(node.value);
		          break;
		        case NodeType.Comment:
		          this.comment(node.value);
		          break;
		        case NodeType.Element:
		          attributes = {};
		          ref = node.attribs;
		          for (attName in ref) {
		            if (!hasProp.call(ref, attName)) continue;
		            att = ref[attName];
		            attributes[attName] = att.value;
		          }
		          this.node(node.name, attributes);
		          break;
		        case NodeType.Dummy:
		          this.dummy();
		          break;
		        case NodeType.Raw:
		          this.raw(node.value);
		          break;
		        case NodeType.Text:
		          this.text(node.value);
		          break;
		        case NodeType.ProcessingInstruction:
		          this.instruction(node.target, node.value);
		          break;
		        default:
		          throw new Error("This XML node type is not supported in a JS object: " + node.constructor.name);
		      }
		      ref1 = node.children;
		      // write child nodes recursively
		      for (i = 0, len = ref1.length; i < len; i++) {
		        child = ref1[i];
		        this.createChildNode(child);
		        if (child.type === NodeType.Element) {
		          this.up();
		        }
		      }
		      return this;
		    }

		    // Creates a dummy node

		    dummy() {
		      // no-op, just return this
		      return this;
		    }

		    // Creates a node

		    // `name` name of the node
		    // `attributes` an object containing name/value pairs of attributes
		    // `text` element text
		    node(name, attributes, text) {
		      if (name == null) {
		        throw new Error("Missing node name.");
		      }
		      if (this.root && this.currentLevel === -1) {
		        throw new Error("Document can only have one root node. " + this.debugInfo(name));
		      }
		      this.openCurrent();
		      name = getValue(name);
		      if (attributes == null) {
		        attributes = {};
		      }
		      attributes = getValue(attributes);
		      // swap argument order: text <-> attributes
		      if (!isObject(attributes)) {
		        [text, attributes] = [attributes, text];
		      }
		      this.currentNode = new XMLElement(this, name, attributes);
		      this.currentNode.children = false;
		      this.currentLevel++;
		      this.openTags[this.currentLevel] = this.currentNode;
		      if (text != null) {
		        this.text(text);
		      }
		      return this;
		    }

		    // Creates a child element node or an element type declaration when called
		    // inside the DTD

		    // `name` name of the node
		    // `attributes` an object containing name/value pairs of attributes
		    // `text` element text
		    element(name, attributes, text) {
		      var child, i, len, oldValidationFlag, ref, root;
		      if (this.currentNode && this.currentNode.type === NodeType.DocType) {
		        this.dtdElement(...arguments);
		      } else {
		        if (Array.isArray(name) || isObject(name) || isFunction(name)) {
		          oldValidationFlag = this.options.noValidation;
		          this.options.noValidation = true;
		          root = new XMLDocument(this.options).element('TEMP_ROOT');
		          root.element(name);
		          this.options.noValidation = oldValidationFlag;
		          ref = root.children;
		          for (i = 0, len = ref.length; i < len; i++) {
		            child = ref[i];
		            this.createChildNode(child);
		            if (child.type === NodeType.Element) {
		              this.up();
		            }
		          }
		        } else {
		          this.node(name, attributes, text);
		        }
		      }
		      return this;
		    }

		    // Adds or modifies an attribute

		    // `name` attribute name
		    // `value` attribute value
		    attribute(name, value) {
		      var attName, attValue;
		      if (!this.currentNode || this.currentNode.children) {
		        throw new Error("att() can only be used immediately after an ele() call in callback mode. " + this.debugInfo(name));
		      }
		      if (name != null) {
		        name = getValue(name);
		      }
		      if (isObject(name)) { // expand if object
		        for (attName in name) {
		          if (!hasProp.call(name, attName)) continue;
		          attValue = name[attName];
		          this.attribute(attName, attValue);
		        }
		      } else {
		        if (isFunction(value)) {
		          value = value.apply();
		        }
		        if (this.options.keepNullAttributes && (value == null)) {
		          this.currentNode.attribs[name] = new XMLAttribute(this, name, "");
		        } else if (value != null) {
		          this.currentNode.attribs[name] = new XMLAttribute(this, name, value);
		        }
		      }
		      return this;
		    }

		    // Creates a text node

		    // `value` element text
		    text(value) {
		      var node;
		      this.openCurrent();
		      node = new XMLText(this, value);
		      this.onData(this.writer.text(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates a CDATA node

		    // `value` element text without CDATA delimiters
		    cdata(value) {
		      var node;
		      this.openCurrent();
		      node = new XMLCData(this, value);
		      this.onData(this.writer.cdata(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates a comment node

		    // `value` comment text
		    comment(value) {
		      var node;
		      this.openCurrent();
		      node = new XMLComment(this, value);
		      this.onData(this.writer.comment(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Adds unescaped raw text

		    // `value` text
		    raw(value) {
		      var node;
		      this.openCurrent();
		      node = new XMLRaw(this, value);
		      this.onData(this.writer.raw(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Adds a processing instruction

		    // `target` instruction target
		    // `value` instruction value
		    instruction(target, value) {
		      var i, insTarget, insValue, len, node;
		      this.openCurrent();
		      if (target != null) {
		        target = getValue(target);
		      }
		      if (value != null) {
		        value = getValue(value);
		      }
		      if (Array.isArray(target)) { // expand if array
		        for (i = 0, len = target.length; i < len; i++) {
		          insTarget = target[i];
		          this.instruction(insTarget);
		        }
		      } else if (isObject(target)) { // expand if object
		        for (insTarget in target) {
		          if (!hasProp.call(target, insTarget)) continue;
		          insValue = target[insTarget];
		          this.instruction(insTarget, insValue);
		        }
		      } else {
		        if (isFunction(value)) {
		          value = value.apply();
		        }
		        node = new XMLProcessingInstruction(this, target, value);
		        this.onData(this.writer.processingInstruction(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      }
		      return this;
		    }

		    // Creates the xml declaration

		    // `version` A version number string, e.g. 1.0
		    // `encoding` Encoding declaration, e.g. UTF-8
		    // `standalone` standalone document declaration: true or false
		    declaration(version, encoding, standalone) {
		      var node;
		      this.openCurrent();
		      if (this.documentStarted) {
		        throw new Error("declaration() must be the first node.");
		      }
		      node = new XMLDeclaration(this, version, encoding, standalone);
		      this.onData(this.writer.declaration(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates the document type declaration

		    // `root`  the name of the root node
		    // `pubID` the public identifier of the external subset
		    // `sysID` the system identifier of the external subset
		    doctype(root, pubID, sysID) {
		      this.openCurrent();
		      if (root == null) {
		        throw new Error("Missing root node name.");
		      }
		      if (this.root) {
		        throw new Error("dtd() must come before the root node.");
		      }
		      this.currentNode = new XMLDocType(this, pubID, sysID);
		      this.currentNode.rootNodeName = root;
		      this.currentNode.children = false;
		      this.currentLevel++;
		      this.openTags[this.currentLevel] = this.currentNode;
		      return this;
		    }

		    // Creates an element type declaration

		    // `name` element name
		    // `value` element content (defaults to #PCDATA)
		    dtdElement(name, value) {
		      var node;
		      this.openCurrent();
		      node = new XMLDTDElement(this, name, value);
		      this.onData(this.writer.dtdElement(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates an attribute declaration

		    // `elementName` the name of the element containing this attribute
		    // `attributeName` attribute name
		    // `attributeType` type of the attribute (defaults to CDATA)
		    // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
		    //                    #DEFAULT) (defaults to #IMPLIED)
		    // `defaultValue` default value of the attribute
		    //                (only used for #FIXED or #DEFAULT)
		    attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
		      var node;
		      this.openCurrent();
		      node = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
		      this.onData(this.writer.dtdAttList(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates a general entity declaration

		    // `name` the name of the entity
		    // `value` internal entity value or an object with external entity details
		    // `value.pubID` public identifier
		    // `value.sysID` system identifier
		    // `value.nData` notation declaration
		    entity(name, value) {
		      var node;
		      this.openCurrent();
		      node = new XMLDTDEntity(this, false, name, value);
		      this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates a parameter entity declaration

		    // `name` the name of the entity
		    // `value` internal entity value or an object with external entity details
		    // `value.pubID` public identifier
		    // `value.sysID` system identifier
		    pEntity(name, value) {
		      var node;
		      this.openCurrent();
		      node = new XMLDTDEntity(this, true, name, value);
		      this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Creates a NOTATION declaration

		    // `name` the name of the notation
		    // `value` an object with external entity details
		    // `value.pubID` public identifier
		    // `value.sysID` system identifier
		    notation(name, value) {
		      var node;
		      this.openCurrent();
		      node = new XMLDTDNotation(this, name, value);
		      this.onData(this.writer.dtdNotation(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
		      return this;
		    }

		    // Gets the parent node
		    up() {
		      if (this.currentLevel < 0) {
		        throw new Error("The document node has no parent.");
		      }
		      if (this.currentNode) {
		        if (this.currentNode.children) {
		          this.closeNode(this.currentNode);
		        } else {
		          this.openNode(this.currentNode);
		        }
		        this.currentNode = null;
		      } else {
		        this.closeNode(this.openTags[this.currentLevel]);
		      }
		      delete this.openTags[this.currentLevel];
		      this.currentLevel--;
		      return this;
		    }

		    // Ends the document
		    end() {
		      while (this.currentLevel >= 0) {
		        this.up();
		      }
		      return this.onEnd();
		    }

		    // Opens the current parent node
		    openCurrent() {
		      if (this.currentNode) {
		        this.currentNode.children = true;
		        return this.openNode(this.currentNode);
		      }
		    }

		    // Writes the opening tag of the current node or the entire node if it has
		    // no child nodes
		    openNode(node) {
		      var att, chunk, name, ref;
		      if (!node.isOpen) {
		        if (!this.root && this.currentLevel === 0 && node.type === NodeType.Element) {
		          this.root = node;
		        }
		        chunk = '';
		        if (node.type === NodeType.Element) {
		          this.writerOptions.state = WriterState.OpenTag;
		          chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + '<' + node.name;
		          ref = node.attribs;
		          for (name in ref) {
		            if (!hasProp.call(ref, name)) continue;
		            att = ref[name];
		            chunk += this.writer.attribute(att, this.writerOptions, this.currentLevel);
		          }
		          chunk += (node.children ? '>' : '/>') + this.writer.endline(node, this.writerOptions, this.currentLevel);
		          this.writerOptions.state = WriterState.InsideTag; // if node.type is NodeType.DocType
		        } else {
		          this.writerOptions.state = WriterState.OpenTag;
		          chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + '<!DOCTYPE ' + node.rootNodeName;
		          
		          // external identifier
		          if (node.pubID && node.sysID) {
		            chunk += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
		          } else if (node.sysID) {
		            chunk += ' SYSTEM "' + node.sysID + '"';
		          }
		          
		          // internal subset
		          if (node.children) {
		            chunk += ' [';
		            this.writerOptions.state = WriterState.InsideTag;
		          } else {
		            this.writerOptions.state = WriterState.CloseTag;
		            chunk += '>';
		          }
		          chunk += this.writer.endline(node, this.writerOptions, this.currentLevel);
		        }
		        this.onData(chunk, this.currentLevel);
		        return node.isOpen = true;
		      }
		    }

		    // Writes the closing tag of the current node
		    closeNode(node) {
		      var chunk;
		      if (!node.isClosed) {
		        chunk = '';
		        this.writerOptions.state = WriterState.CloseTag;
		        if (node.type === NodeType.Element) {
		          chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + '</' + node.name + '>' + this.writer.endline(node, this.writerOptions, this.currentLevel); // if node.type is NodeType.DocType
		        } else {
		          chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + ']>' + this.writer.endline(node, this.writerOptions, this.currentLevel);
		        }
		        this.writerOptions.state = WriterState.None;
		        this.onData(chunk, this.currentLevel);
		        return node.isClosed = true;
		      }
		    }

		    // Called when a new chunk of XML is output

		    // `chunk` a string containing the XML chunk
		    // `level` current indentation level
		    onData(chunk, level) {
		      this.documentStarted = true;
		      return this.onDataCallback(chunk, level + 1);
		    }

		    // Called when the XML document is completed
		    onEnd() {
		      this.documentCompleted = true;
		      return this.onEndCallback();
		    }

		    // Returns debug string
		    debugInfo(name) {
		      if (name == null) {
		        return "";
		      } else {
		        return "node: <" + name + ">";
		      }
		    }

		    // Node aliases
		    ele() {
		      return this.element(...arguments);
		    }

		    nod(name, attributes, text) {
		      return this.node(name, attributes, text);
		    }

		    txt(value) {
		      return this.text(value);
		    }

		    dat(value) {
		      return this.cdata(value);
		    }

		    com(value) {
		      return this.comment(value);
		    }

		    ins(target, value) {
		      return this.instruction(target, value);
		    }

		    dec(version, encoding, standalone) {
		      return this.declaration(version, encoding, standalone);
		    }

		    dtd(root, pubID, sysID) {
		      return this.doctype(root, pubID, sysID);
		    }

		    e(name, attributes, text) {
		      return this.element(name, attributes, text);
		    }

		    n(name, attributes, text) {
		      return this.node(name, attributes, text);
		    }

		    t(value) {
		      return this.text(value);
		    }

		    d(value) {
		      return this.cdata(value);
		    }

		    c(value) {
		      return this.comment(value);
		    }

		    r(value) {
		      return this.raw(value);
		    }

		    i(target, value) {
		      return this.instruction(target, value);
		    }

		    // Attribute aliases
		    att() {
		      if (this.currentNode && this.currentNode.type === NodeType.DocType) {
		        return this.attList(...arguments);
		      } else {
		        return this.attribute(...arguments);
		      }
		    }

		    a() {
		      if (this.currentNode && this.currentNode.type === NodeType.DocType) {
		        return this.attList(...arguments);
		      } else {
		        return this.attribute(...arguments);
		      }
		    }

		    // DTD aliases
		    // att() and ele() are defined above
		    ent(name, value) {
		      return this.entity(name, value);
		    }

		    pent(name, value) {
		      return this.pEntity(name, value);
		    }

		    not(name, value) {
		      return this.notation(name, value);
		    }

		  };

		}).call(XMLDocumentCB);
		return XMLDocumentCB$1.exports;
	}

	var XMLStreamWriter$1 = {exports: {}};

	var XMLStreamWriter = XMLStreamWriter$1.exports;

	var hasRequiredXMLStreamWriter;

	function requireXMLStreamWriter () {
		if (hasRequiredXMLStreamWriter) return XMLStreamWriter$1.exports;
		hasRequiredXMLStreamWriter = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, WriterState, XMLWriterBase,
		    hasProp = {}.hasOwnProperty;

		  NodeType = requireNodeType();

		  XMLWriterBase = requireXMLWriterBase();

		  WriterState = requireWriterState();

		  // Prints XML nodes to a stream
		  XMLStreamWriter$1.exports = class XMLStreamWriter extends XMLWriterBase {
		    // Initializes a new instance of `XMLStreamWriter`

		    // `stream` output stream
		    // `options.pretty` pretty prints the result
		    // `options.indent` indentation string
		    // `options.newline` newline sequence
		    // `options.offset` a fixed number of indentations to add to every line
		    // `options.allowEmpty` do not self close empty element tags
		    // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
		    // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
		    constructor(stream, options) {
		      super(options);
		      this.stream = stream;
		    }

		    endline(node, options, level) {
		      if (node.isLastRootNode && options.state === WriterState.CloseTag) {
		        return '';
		      } else {
		        return super.endline(node, options, level);
		      }
		    }

		    document(doc, options) {
		      var child, i, j, k, len1, len2, ref, ref1, results;
		      ref = doc.children;
		      // set a flag so that we don't insert a newline after the last root level node 
		      for (i = j = 0, len1 = ref.length; j < len1; i = ++j) {
		        child = ref[i];
		        child.isLastRootNode = i === doc.children.length - 1;
		      }
		      options = this.filterOptions(options);
		      ref1 = doc.children;
		      results = [];
		      for (k = 0, len2 = ref1.length; k < len2; k++) {
		        child = ref1[k];
		        results.push(this.writeChildNode(child, options, 0));
		      }
		      return results;
		    }

		    cdata(node, options, level) {
		      return this.stream.write(super.cdata(node, options, level));
		    }

		    comment(node, options, level) {
		      return this.stream.write(super.comment(node, options, level));
		    }

		    declaration(node, options, level) {
		      return this.stream.write(super.declaration(node, options, level));
		    }

		    docType(node, options, level) {
		      var child, j, len1, ref;
		      level || (level = 0);
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      this.stream.write(this.indent(node, options, level));
		      this.stream.write('<!DOCTYPE ' + node.root().name);
		      // external identifier
		      if (node.pubID && node.sysID) {
		        this.stream.write(' PUBLIC "' + node.pubID + '" "' + node.sysID + '"');
		      } else if (node.sysID) {
		        this.stream.write(' SYSTEM "' + node.sysID + '"');
		      }
		      // internal subset
		      if (node.children.length > 0) {
		        this.stream.write(' [');
		        this.stream.write(this.endline(node, options, level));
		        options.state = WriterState.InsideTag;
		        ref = node.children;
		        for (j = 0, len1 = ref.length; j < len1; j++) {
		          child = ref[j];
		          this.writeChildNode(child, options, level + 1);
		        }
		        options.state = WriterState.CloseTag;
		        this.stream.write(']');
		      }
		      // close tag
		      options.state = WriterState.CloseTag;
		      this.stream.write(options.spaceBeforeSlash + '>');
		      this.stream.write(this.endline(node, options, level));
		      options.state = WriterState.None;
		      return this.closeNode(node, options, level);
		    }

		    element(node, options, level) {
		      var att, attLen, child, childNodeCount, firstChildNode, j, len, len1, name, r, ratt, ref, ref1, ref2, rline;
		      level || (level = 0);
		      // open tag
		      this.openNode(node, options, level);
		      options.state = WriterState.OpenTag;
		      r = this.indent(node, options, level) + '<' + node.name;
		      // attributes
		      if (options.pretty && options.width > 0) {
		        len = r.length;
		        ref = node.attribs;
		        for (name in ref) {
		          if (!hasProp.call(ref, name)) continue;
		          att = ref[name];
		          ratt = this.attribute(att, options, level);
		          attLen = ratt.length;
		          if (len + attLen > options.width) {
		            rline = this.indent(node, options, level + 1) + ratt;
		            r += this.endline(node, options, level) + rline;
		            len = rline.length;
		          } else {
		            rline = ' ' + ratt;
		            r += rline;
		            len += rline.length;
		          }
		        }
		      } else {
		        ref1 = node.attribs;
		        for (name in ref1) {
		          if (!hasProp.call(ref1, name)) continue;
		          att = ref1[name];
		          r += this.attribute(att, options, level);
		        }
		      }
		      this.stream.write(r);
		      childNodeCount = node.children.length;
		      firstChildNode = childNodeCount === 0 ? null : node.children[0];
		      if (childNodeCount === 0 || node.children.every(function(e) {
		        return (e.type === NodeType.Text || e.type === NodeType.Raw || e.type === NodeType.CData) && e.value === '';
		      })) {
		        // empty element
		        if (options.allowEmpty) {
		          this.stream.write('>');
		          options.state = WriterState.CloseTag;
		          this.stream.write('</' + node.name + '>');
		        } else {
		          options.state = WriterState.CloseTag;
		          this.stream.write(options.spaceBeforeSlash + '/>');
		        }
		      } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw || firstChildNode.type === NodeType.CData) && (firstChildNode.value != null)) {
		        // do not indent text-only nodes
		        this.stream.write('>');
		        options.state = WriterState.InsideTag;
		        options.suppressPrettyCount++;
		        this.writeChildNode(firstChildNode, options, level + 1);
		        options.suppressPrettyCount--;
		        options.state = WriterState.CloseTag;
		        this.stream.write('</' + node.name + '>');
		      } else {
		        this.stream.write('>' + this.endline(node, options, level));
		        options.state = WriterState.InsideTag;
		        ref2 = node.children;
		        // inner tags
		        for (j = 0, len1 = ref2.length; j < len1; j++) {
		          child = ref2[j];
		          this.writeChildNode(child, options, level + 1);
		        }
		        // close tag
		        options.state = WriterState.CloseTag;
		        this.stream.write(this.indent(node, options, level) + '</' + node.name + '>');
		      }
		      this.stream.write(this.endline(node, options, level));
		      options.state = WriterState.None;
		      return this.closeNode(node, options, level);
		    }

		    processingInstruction(node, options, level) {
		      return this.stream.write(super.processingInstruction(node, options, level));
		    }

		    raw(node, options, level) {
		      return this.stream.write(super.raw(node, options, level));
		    }

		    text(node, options, level) {
		      return this.stream.write(super.text(node, options, level));
		    }

		    dtdAttList(node, options, level) {
		      return this.stream.write(super.dtdAttList(node, options, level));
		    }

		    dtdElement(node, options, level) {
		      return this.stream.write(super.dtdElement(node, options, level));
		    }

		    dtdEntity(node, options, level) {
		      return this.stream.write(super.dtdEntity(node, options, level));
		    }

		    dtdNotation(node, options, level) {
		      return this.stream.write(super.dtdNotation(node, options, level));
		    }

		  };

		}).call(XMLStreamWriter);
		return XMLStreamWriter$1.exports;
	}

	var hasRequiredLib;

	function requireLib () {
		if (hasRequiredLib) return lib;
		hasRequiredLib = 1;
		// Generated by CoffeeScript 2.4.1
		(function() {
		  var NodeType, WriterState, XMLDOMImplementation, XMLDocument, XMLDocumentCB, XMLStreamWriter, XMLStringWriter, assign, isFunction;

		  ({assign, isFunction} = requireUtility());

		  XMLDOMImplementation = requireXMLDOMImplementation();

		  XMLDocument = requireXMLDocument();

		  XMLDocumentCB = requireXMLDocumentCB();

		  XMLStringWriter = requireXMLStringWriter();

		  XMLStreamWriter = requireXMLStreamWriter();

		  NodeType = requireNodeType();

		  WriterState = requireWriterState();

		  // Creates a new document and returns the root node for
		  // chain-building the document tree

		  // `name` name of the root element

		  // `xmldec.version` A version number string, e.g. 1.0
		  // `xmldec.encoding` Encoding declaration, e.g. UTF-8
		  // `xmldec.standalone` standalone document declaration: true or false

		  // `doctype.pubID` public identifier of the external subset
		  // `doctype.sysID` system identifier of the external subset

		  // `options.headless` whether XML declaration and doctype will be included:
		  //     true or false
		  // `options.keepNullNodes` whether nodes with null values will be kept
		  //     or ignored: true or false
		  // `options.keepNullAttributes` whether attributes with null values will be
		  //     kept or ignored: true or false
		  // `options.ignoreDecorators` whether decorator strings will be ignored when
		  //     converting JS objects: true or false
		  // `options.separateArrayItems` whether array items are created as separate
		  //     nodes when passed as an object value: true or false
		  // `options.noDoubleEncoding` whether existing html entities are encoded:
		  //     true or false
		  // `options.stringify` a set of functions to use for converting values to
		  //     strings
		  // `options.writer` the default XML writer to use for converting nodes to
		  //     string. If the default writer is not set, the built-in XMLStringWriter
		  //     will be used instead.
		  lib.create = function(name, xmldec, doctype, options) {
		    var doc, root;
		    if (name == null) {
		      throw new Error("Root element needs a name.");
		    }
		    options = assign({}, xmldec, doctype, options);
		    // create the document node
		    doc = new XMLDocument(options);
		    // add the root node
		    root = doc.element(name);
		    // prolog
		    if (!options.headless) {
		      doc.declaration(options);
		      if ((options.pubID != null) || (options.sysID != null)) {
		        doc.dtd(options);
		      }
		    }
		    return root;
		  };

		  // Creates a new document and returns the document node for
		  // chain-building the document tree

		  // `options.keepNullNodes` whether nodes with null values will be kept
		  //     or ignored: true or false
		  // `options.keepNullAttributes` whether attributes with null values will be
		  //     kept or ignored: true or false
		  // `options.ignoreDecorators` whether decorator strings will be ignored when
		  //     converting JS objects: true or false
		  // `options.separateArrayItems` whether array items are created as separate
		  //     nodes when passed as an object value: true or false
		  // `options.noDoubleEncoding` whether existing html entities are encoded:
		  //     true or false
		  // `options.stringify` a set of functions to use for converting values to
		  //     strings
		  // `options.writer` the default XML writer to use for converting nodes to
		  //     string. If the default writer is not set, the built-in XMLStringWriter
		  //     will be used instead.

		  // `onData` the function to be called when a new chunk of XML is output. The
		  //          string containing the XML chunk is passed to `onData` as its single
		  //          argument.
		  // `onEnd`  the function to be called when the XML document is completed with
		  //          `end`. `onEnd` does not receive any arguments.
		  lib.begin = function(options, onData, onEnd) {
		    if (isFunction(options)) {
		      [onData, onEnd] = [options, onData];
		      options = {};
		    }
		    if (onData) {
		      return new XMLDocumentCB(options, onData, onEnd);
		    } else {
		      return new XMLDocument(options);
		    }
		  };

		  lib.stringWriter = function(options) {
		    return new XMLStringWriter(options);
		  };

		  lib.streamWriter = function(stream, options) {
		    return new XMLStreamWriter(stream, options);
		  };

		  lib.implementation = new XMLDOMImplementation();

		  lib.nodeType = NodeType;

		  lib.writerState = WriterState;

		}).call(lib);
		return lib;
	}

	/**
	 * Module dependencies.
	 */

	var hasRequiredBuild;

	function requireBuild () {
		if (hasRequiredBuild) return build;
		hasRequiredBuild = 1;
		var base64 = requireBase64Js();
		var xmlbuilder = requireLib();

		/**
		 * Module exports.
		 */

		build.build = build$1;

		/**
		 * Accepts a `Date` instance and returns an ISO date string.
		 *
		 * @param {Date} d - Date instance to serialize
		 * @returns {String} ISO date string representation of `d`
		 * @api private
		 */

		function ISODateString(d){
		  function pad(n){
		    return n < 10 ? '0' + n : n;
		  }
		  return d.getUTCFullYear()+'-'
		    + pad(d.getUTCMonth()+1)+'-'
		    + pad(d.getUTCDate())+'T'
		    + pad(d.getUTCHours())+':'
		    + pad(d.getUTCMinutes())+':'
		    + pad(d.getUTCSeconds())+'Z';
		}

		/**
		 * Returns the internal "type" of `obj` via the
		 * `Object.prototype.toString()` trick.
		 *
		 * @param {Mixed} obj - any value
		 * @returns {String} the internal "type" name
		 * @api private
		 */

		var toString = Object.prototype.toString;
		function type (obj) {
		  var m = toString.call(obj).match(/\[object (.*)\]/);
		  return m ? m[1] : m;
		}

		/**
		 * Generate an XML plist string from the input object `obj`.
		 *
		 * @param {Object} obj - the object to convert
		 * @param {Object} [opts] - optional options object
		 * @returns {String} converted plist XML string
		 * @api public
		 */

		function build$1 (obj, opts) {
		  var XMLHDR = {
		    version: '1.0',
		    encoding: 'UTF-8'
		  };

		  var XMLDTD = {
		    pubid: '-//Apple//DTD PLIST 1.0//EN',
		    sysid: 'http://www.apple.com/DTDs/PropertyList-1.0.dtd'
		  };

		  var doc = xmlbuilder.create('plist');

		  doc.dec(XMLHDR.version, XMLHDR.encoding, XMLHDR.standalone);
		  doc.dtd(XMLDTD.pubid, XMLDTD.sysid);
		  doc.att('version', '1.0');

		  walk_obj(obj, doc);

		  if (!opts) opts = {};
		  // default `pretty` to `true`
		  opts.pretty = opts.pretty !== false;
		  return doc.end(opts);
		}

		/**
		 * depth first, recursive traversal of a javascript object. when complete,
		 * next_child contains a reference to the build XML object.
		 *
		 * @api private
		 */

		function walk_obj(next, next_child) {
		  var tag_type, i, prop;
		  var name = type(next);

		  if ('Undefined' == name) {
		    return;
		  } else if (Array.isArray(next)) {
		    next_child = next_child.ele('array');
		    for (i = 0; i < next.length; i++) {
		      walk_obj(next[i], next_child);
		    }

		  } else if (Buffer.isBuffer(next)) {
		    next_child.ele('data').raw(next.toString('base64'));

		  } else if ('Object' == name) {
		    next_child = next_child.ele('dict');
		    for (prop in next) {
		      if (next.hasOwnProperty(prop)) {
		        next_child.ele('key').txt(prop);
		        walk_obj(next[prop], next_child);
		      }
		    }

		  } else if ('Number' == name) {
		    // detect if this is an integer or real
		    // TODO: add an ability to force one way or another via a "cast"
		    tag_type = (next % 1 === 0) ? 'integer' : 'real';
		    next_child.ele(tag_type).txt(next.toString());

		  } else if ('BigInt' == name) {
		    next_child.ele('integer').txt(next);

		  } else if ('Date' == name) {
		    next_child.ele('date').txt(ISODateString(new Date(next)));

		  } else if ('Boolean' == name) {
		    next_child.ele(next ? 'true' : 'false');

		  } else if ('String' == name) {
		    next_child.ele('string').txt(next);

		  } else if ('ArrayBuffer' == name) {
		    next_child.ele('data').raw(base64.fromByteArray(next));

		  } else if (next && next.buffer && 'ArrayBuffer' == type(next.buffer)) {
		    // a typed array
		    next_child.ele('data').raw(base64.fromByteArray(new Uint8Array(next.buffer), next_child));

		  } else if ('Null' === name) {
		    next_child.ele('null').txt('');

		  }
		}
		return build;
	}

	/**
	 * Parser functions.
	 */

	var hasRequiredPlist;

	function requirePlist () {
		if (hasRequiredPlist) return plist$1;
		hasRequiredPlist = 1;
		(function (exports$1) {
			var parserFunctions = requireParse();
			Object.keys(parserFunctions).forEach(function (k) { exports$1[k] = parserFunctions[k]; });

			/**
			 * Builder functions.
			 */

			var builderFunctions = requireBuild();
			Object.keys(builderFunctions).forEach(function (k) { exports$1[k] = builderFunctions[k]; }); 
		} (plist$1));
		return plist$1;
	}

	var plistExports = requirePlist();
	var plist = /*@__PURE__*/getDefaultExportFromCjs(plistExports);

	/* eslint-disable n/no-sync -- Needed for performance */

	// Get Node APIs from the preload script
	const {
	  fs: {existsSync: existsSync$3, readFileSync, lstatSync: lstatSync$3},
	  path: path$5,
	  getLocalizedUTIDescription
	} = globalThis.electronAPI;

	/**
	 * @param {string} folderPath
	 * @returns {boolean}
	 */
	function isMacApp (folderPath) {
	  try {
	    const stats = lstatSync$3(folderPath);

	    if (!stats.isDirectory()) {
	      return false; // Not a directory, so not an app bundle
	    }

	    const contentsPath = path$5.join(folderPath, 'Contents');
	    const macOSPath = path$5.join(contentsPath, 'MacOS');
	    const infoPlistPath = path$5.join(contentsPath, 'Info.plist');

	    // Check for the presence of key directories and files
	    const contentsExists = lstatSync$3(contentsPath).isDirectory();
	    const macOSExists = lstatSync$3(macOSPath).isDirectory();
	    const infoPlistExists = lstatSync$3(infoPlistPath).isFile();

	    return contentsExists && macOSExists && infoPlistExists;
	  } catch (error) {
	    // Handle errors like path not found
	    return false;
	  }
	}

	/**
	 * Get the category of a specified Mac application.
	 * @param {string} appPath - The path of the application (e.g.,
	 *   "/Applications/Google Chrome.app").
	 * @returns {string|null} The application category or null if not found.
	 */
	function getMacAppCategory (appPath) {
	  const appName = path$5.dirname(appPath);
	  const infoPlistPath = path$5.join(appPath, 'Contents', 'Info.plist');

	  if (!existsSync$3(infoPlistPath)) {
	    // eslint-disable-next-line no-console -- Debugging
	    console.error(`Info.plist not found for ${appName}`);
	    return null;
	  }

	  try {
	    const plistContent = readFileSync(infoPlistPath, 'utf8');
	    const parsedPlist = plist.parse(plistContent);
	    const category = parsedPlist.LSApplicationCategoryType;

	    if (category) {
	      // Get localized version
	      // (e.g., "public.app-category.productivity" -> "Productivity")
	      return getLocalizedUTIDescription(category);
	    }

	    // eslint-disable-next-line no-console -- Debugging
	    console.log(
	      `LSApplicationCategoryType not found in ${appName}'s Info.plist`
	    );
	    return null;
	  } catch (error) {
	    // eslint-disable-next-line no-console -- Debugging
	    console.error(
	      `Error reading or parsing plist for ${appName}:`, error.message
	    );
	    return null;
	  }
	}

	/* eslint-disable n/no-sync -- Needed for performance */


	// Get Node APIs from the preload script
	const {
	  fs: {readdirSync, lstatSync: lstatSync$2},
	  path: path$4,
	  // eslint-disable-next-line no-shadow -- Different process
	  process: process$1
	} = globalThis.electronAPI;

	/**
	 * Get the base path from URL hash or command line arguments.
	 * @returns {string}
	 */
	function getBasePath () {
	  if (!location.hash.length && process$1.argv.length) {
	    const idx = process$1.argv.findIndex((arg) => {
	      return arg === '--path' || arg === 'p';
	    });
	    /* c8 ignore next -- App with arguments */
	    return idx === -1 ? '/' : process$1.argv[idx + 1];
	  }

	  const params = new URLSearchParams(location.hash.slice(1));
	  return path$4.normalize(
	    params.has('path') ? params.get('path') + '/' : '/'
	  );
	}

	/**
	 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
	 */

	/**
	 * Read a directory and return sorted entries.
	 * @param {string} basePath
	 * @returns {Result[]}
	 */
	function readDirectory (basePath) {
	  return readdirSync(basePath).
	    map((fileOrDir) => {
	      const fileOrDirPath = path$4.join(basePath, fileOrDir);
	      const stat = lstatSync$2(fileOrDirPath);
	      const isDir = stat.isDirectory() && !isMacApp(fileOrDirPath);
	      return /** @type {Result} */ (
	        [isDir || stat.isSymbolicLink(), basePath, fileOrDir]
	      );
	    }).toSorted(([, , a], [, , b]) => {
	      return a.localeCompare(b, undefined, {sensitivity: 'base'});
	    });
	}

	// eslint-disable-next-line no-shadow -- Importing storage as `localStorage`

	/**
	 * Get the current view mode.
	 * @returns {string}
	 */
	const getCurrentView = () => {
	  return localStorage.getItem('view') ?? 'icon-view';
	};

	/**
	 * @typedef {{
	 *   element: HTMLDivElement,
	 *   content: HTMLDivElement,
	 *   title: HTMLDivElement,
	 *   color: string,
	 *   metadata: Record<string, string>
	 * }} NoteData
	 */

	/**
	 * @typedef {{
	 *   id?: string,
	 *   x?: number,
	 *   y?: number,
	 *   width?: number,
	 *   height?: number,
	 *   zIndex?: number,
	 *   color?: string,
	 *   html?: string,
	 *   title?: string,
	 *   collapsed?: boolean,
	 *   metadata?: Record<string, string>
	 * }} NoteInfo
	 */

	/**
	 * Sticky Notes Library
	 * A lightweight, vanilla JavaScript library for creating draggable, editable
	 * sticky notes.
	 */
	class StickyNote {
	  /**
	   * @param {{
	   *   container?: HTMLElement,
	   *   colors?: string[],
	   *   defaultColor?: string,
	   *   onDelete?: (noteData: NoteData) => void
	   * }} [options]
	   */
	  constructor (options = {}) {
	    this.container = options.container || document.body;
	    /** @type {NoteData[]} */
	    this.notes = [];
	    this.draggedNote = null;
	    this.resizedNote = null;
	    this.resizeStart = {x: 0, y: 0, width: 0, height: 0};
	    this.offset = {x: 0, y: 0};
	    this.colors = options.colors ||
	      ['#fff740', '#ff7eb9', '#7afcff', '#feff9c', '#a7ffeb'];
	    this.defaultColor = options.defaultColor || this.colors[0];
	    this.onDelete = options.onDelete;

	    this.init();
	  }

	  /**
	   * @returns {void}
	   */
	  init () {
	    // Add base styles
	    this.injectStyles();

	    // Bind events
	    document.addEventListener('mousemove', this.handleDrag.bind(this));
	    document.addEventListener('mouseup', this.handleDragEnd.bind(this));
	    document.addEventListener('mousemove', this.handleResize.bind(this));
	    document.addEventListener('mouseup', this.handleResizeEnd.bind(this));
	  }

	  /**
	   * @returns {void}
	   */
	  // eslint-disable-next-line class-methods-use-this -- Convenient
	  injectStyles () {
	    if (document.querySelector('#sticky-notes-styles')) {
	      return;
	    }

	    const style = document.createElement('style');
	    style.id = 'sticky-notes-styles';
	    style.textContent = `
      .sticky-note {
        position: absolute;
        width: 200px;
        min-height: 150px;
        padding: 10px;
        background: #fff740;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        border-radius: 2px;
        font-family: 'Comic Sans MS', cursive, sans-serif;
        font-size: 14px;
        cursor: move;
        user-select: none;
        z-index: 1;
      }

      .sticky-note.dragging {
        opacity: 0.8;
        z-index: 1000;
      }

      .sticky-note.collapsed {
        min-height: auto !important;
        height: auto !important;
      }

      .sticky-note.collapsed .sticky-note-controls {
        display: none;
      }

      .sticky-note.collapsed .sticky-note-content {
        display: none;
      }

      .sticky-note-content {
        outline: none;
        min-height: 100px;
        cursor: text;
        word-wrap: break-word;
        user-select: text;
      }

      .sticky-note-title {
        outline: none;
        font-weight: bold;
        font-size: 13px;
        padding: 2px 4px;
        border-radius: 2px;
        user-select: none;
        min-height: 0;
        display: none;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sticky-note-title.has-content {
        display: block;
      }

      .sticky-note-title.editing {
        cursor: text;
        user-select: text;
        background: rgba(255, 255, 255, 0.3);
        white-space: normal;
      }

      .sticky-note-title.editing:empty:before {
        content: 'Enter title...';
        color: rgba(0, 0, 0, 0.3);
        font-weight: normal;
        font-style: italic;
      }

      .sticky-note-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        margin-bottom: 5px;
        padding-bottom: 5px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      }

      .sticky-note.collapsed .sticky-note-header {
        border-bottom: none;
        padding-bottom: 0;
        margin-bottom: 0;
        min-height: 20px;
        cursor: pointer;
      }

      .sticky-note-controls {
        display: flex;
        justify-content: flex-end;
        gap: 5px;
      }

      .sticky-note-btn {
        background: rgba(0, 0, 0, 0.1);
        border: none;
        border-radius: 3px;
        padding: 3px 8px;
        cursor: pointer;
        font-size: 12px;
      }

      .sticky-note-btn:hover {
        background: rgba(0, 0, 0, 0.2);
      }

      .sticky-note-confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .sticky-note-confirm-dialog {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        min-width: 300px;
        font-family: Arial, sans-serif;
      }

      .sticky-note-confirm-message {
        margin-bottom: 20px;
        font-size: 14px;
        color: #333;
      }

      .sticky-note-confirm-buttons {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }

      .sticky-note-confirm-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }

      .sticky-note-confirm-btn-yes {
        background: #dc3545;
        color: white;
      }

      .sticky-note-confirm-btn-yes:hover {
        background: #c82333;
      }

      .sticky-note-confirm-btn-no {
        background: #6c757d;
        color: white;
      }

      .sticky-note-confirm-btn-no:hover {
        background: #5a6268;
      }

      .sticky-note-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        z-index: 10;
      }

      .sticky-note-resize-handle::after {
        content: '';
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 0 0 12px 12px;
        border-color: transparent transparent rgba(0, 0, 0, 0.2) transparent;
      }

      .sticky-note.resizing {
        opacity: 0.8;
      }
    `;
	    document.head.append(style);
	  }

	  /**
	   * @param {NoteInfo} [options]
	   * @returns {NoteData}
	   */
	  createNote (options = {}) {
	    const note = document.createElement('div');
	    note.className = 'sticky-note';

	    const id = options.id ||
	    // eslint-disable-next-line sonarjs/pseudo-random -- Safe
	      String(Math.floor(Math.random() * 10000000000000000));
	    // eslint-disable-next-line sonarjs/pseudo-random -- Safe
	    const x = options.x || Math.random() * (window.innerWidth - 250);
	    // eslint-disable-next-line sonarjs/pseudo-random -- Safe
	    const y = options.y || Math.random() * (window.innerHeight - 200);
	    const width = options.width || 200;
	    const height = options.height || 150;
	    const zIndex = options.zIndex || 1;
	    const color = options.color || this.defaultColor;
	    const html = options.html || '';
	    const title = options.title || '';
	    const collapsed = options.collapsed || false;

	    note.dataset.id = id;
	    note.style.left = `${x}px`;
	    note.style.top = `${y}px`;
	    note.style.width = `${width}px`;
	    note.style.minHeight = `${height}px`;
	    note.style.zIndex = String(zIndex);
	    note.style.background = color;

	    // Store original height for collapse/expand
	    note.dataset.expandedHeight = height.toString();

	    // Store color index for cycling
	    const colorIndex = this.colors.indexOf(color);
	    note.dataset.colorIndex = colorIndex !== -1 ? colorIndex.toString() : '0';

	    // Create title
	    const titleElement = document.createElement('div');
	    titleElement.className = 'sticky-note-title';
	    titleElement.contentEditable = 'false';
	    titleElement.textContent = title;
	    if (title) {
	      titleElement.classList.add('has-content');
	    }

	    // Prevent drag only when editing title
	    titleElement.addEventListener('mousedown', (e) => {
	      if (titleElement.classList.contains('editing')) {
	        e.stopPropagation();
	      }
	    });

	    // Create controls
	    const controls = document.createElement('div');
	    controls.className = 'sticky-note-controls';

	    const deleteBtn = document.createElement('button');
	    deleteBtn.className = 'sticky-note-btn';
	    deleteBtn.textContent = '×';
	    deleteBtn.title = 'Delete note';
	    deleteBtn.addEventListener('click', (e) => {
	      e.stopPropagation();
	      this.showConfirm('Delete this note?', () => {
	        this.deleteNote(note);
	      });
	    });

	    const colorBtn = document.createElement('button');
	    colorBtn.className = 'sticky-note-btn';
	    colorBtn.textContent = '🎨';
	    colorBtn.title = 'Change color';
	    colorBtn.addEventListener('click', (e) => {
	      e.stopPropagation();
	      this.cycleColor(note);
	    });

	    const editTitleBtn = document.createElement('button');
	    editTitleBtn.className = 'sticky-note-btn';
	    editTitleBtn.textContent = '✏️';
	    editTitleBtn.title = 'Edit title';
	    editTitleBtn.addEventListener('click', (e) => {
	      e.stopPropagation();
	      this.toggleTitleEdit(titleElement);
	    });

	    controls.append(editTitleBtn);
	    controls.append(colorBtn);
	    controls.append(deleteBtn);

	    // Create content area
	    const content = document.createElement('div');
	    content.className = 'sticky-note-content';
	    content.contentEditable = 'true';
	    content.innerHTML = html;

	    // Prevent drag when editing
	    content.addEventListener('mousedown', (e) => {
	      e.stopPropagation();
	      // Exit title edit mode when clicking into content area
	      if (titleElement.classList.contains('editing')) {
	        this.toggleTitleEdit(titleElement);
	      }
	    });

	    // Handle drag start on note header
	    note.addEventListener('mousedown', (e) => {
	      if (e.target === content || content.contains(/** @type {Node} */ (
	        e.target
	      ))) {
	        return;
	      }
	      if (e.target === titleElement &&
	        titleElement.classList.contains('editing')) {
	        return;
	      }
	      this.handleDragStart(e, note);
	    });

	    // Bring to front on click
	    note.addEventListener('mousedown', () => {
	      this.bringToFront(note);
	    });

	    // Create header wrapper for title and controls
	    const header = document.createElement('div');
	    header.className = 'sticky-note-header';

	    header.append(titleElement);
	    header.append(controls);

	    // Create resize handle
	    const resizeHandle = document.createElement('div');
	    resizeHandle.className = 'sticky-note-resize-handle';
	    resizeHandle.addEventListener('mousedown', (e) => {
	      e.stopPropagation();
	      this.handleResizeStart(e, note);
	    });

	    note.append(header);
	    note.append(content);
	    note.append(resizeHandle);

	    // Double-click to collapse/expand when clicking on header area
	    note.addEventListener('dblclick', (e) => {
	      // Only collapse if double-clicking the header (not content area)
	      if (content.contains(/** @type {Node} */ (e.target)) ||
	          e.target === content) {
	        return;
	      }
	      if (titleElement.classList.contains('editing')) {
	        return;
	      }
	      if (/** @type {HTMLElement} */ (
	        e.target
	      ).classList.contains('sticky-note-btn')) {
	        return;
	      }

	      const isCollapsed = note.classList.contains('collapsed');

	      if (isCollapsed) {
	        // Expanding - restore the height
	        const expandedHeight = note.dataset.expandedHeight || '150';
	        note.style.minHeight = `${expandedHeight}px`;
	      } else {
	        // Collapsing - store current height
	        note.dataset.expandedHeight = note.offsetHeight.toString();
	      }

	      note.classList.toggle('collapsed');
	    });

	    this.container.append(note);

	    // Apply collapsed state if specified
	    if (collapsed) {
	      note.classList.add('collapsed');
	    }

	    const noteData = {
	      element: note,
	      content,
	      title: titleElement,
	      color,
	      metadata: options.metadata || {}
	    };

	    this.notes.push(noteData);
	    return noteData;
	  }

	  /**
	   * @param {MouseEvent} e
	   * @param {HTMLDivElement} note
	   * @returns {void}
	   */
	  handleDragStart (e, note) {
	    this.draggedNote = note;
	    this.offset.x = e.clientX - note.offsetLeft;
	    this.offset.y = e.clientY - note.offsetTop;
	    note.classList.add('dragging');
	  }

	  /**
	   * @param {MouseEvent} e
	   * @returns {void}
	   */
	  handleDrag (e) {
	    if (!this.draggedNote) {
	      return;
	    }

	    const x = e.clientX - this.offset.x;
	    const y = e.clientY - this.offset.y;

	    this.draggedNote.style.left = `${x}px`;
	    this.draggedNote.style.top = `${y}px`;
	  }

	  /**
	   * @returns {void}
	   */
	  handleDragEnd () {
	    if (this.draggedNote) {
	      this.draggedNote.classList.remove('dragging');
	      this.draggedNote = null;
	    }
	  }

	  /**
	   * @param {MouseEvent} e
	   * @param {HTMLDivElement} note
	   * @returns {void}
	   */
	  handleResizeStart (e, note) {
	    this.resizedNote = note;
	    this.resizeStart.x = e.clientX;
	    this.resizeStart.y = e.clientY;
	    this.resizeStart.width = note.offsetWidth;
	    this.resizeStart.height = note.offsetHeight;
	    note.classList.add('resizing');
	  }

	  /**
	   * @param {MouseEvent} e
	   * @returns {void}
	   */
	  handleResize (e) {
	    if (!this.resizedNote) {
	      return;
	    }

	    const deltaX = e.clientX - this.resizeStart.x;
	    const deltaY = e.clientY - this.resizeStart.y;

	    const newWidth = Math.max(150, this.resizeStart.width + deltaX);
	    const newHeight = Math.max(100, this.resizeStart.height + deltaY);

	    this.resizedNote.style.width = `${newWidth}px`;
	    this.resizedNote.style.minHeight = `${newHeight}px`;
	  }

	  /**
	   * @returns {void}
	   */
	  handleResizeEnd () {
	    if (this.resizedNote) {
	      this.resizedNote.classList.remove('resizing');
	      this.resizedNote = null;
	    }
	  }

	  /**
	   * @param {HTMLDivElement} note
	   * @returns {void}
	   */
	  cycleColor (note) {
	    // Store current color index as data attribute
	    let currentIndex = Number.parseInt(note.dataset.colorIndex || '0');
	    currentIndex = (currentIndex + 1) % this.colors.length;
	    note.style.background = this.colors[currentIndex];
	    note.dataset.colorIndex = currentIndex.toString();
	  }

	  /**
	   * @param {HTMLElement} titleElement
	   * @returns {void}
	   */
	  // eslint-disable-next-line class-methods-use-this -- Convenient
	  toggleTitleEdit (titleElement) {
	    const isEditing = titleElement.classList.contains('editing');

	    if (isEditing) {
	      // Exit edit mode
	      titleElement.classList.remove('editing');
	      titleElement.contentEditable = 'false';
	      titleElement.blur();

	      // Show/hide title based on content
	      if (titleElement.textContent.trim()) {
	        titleElement.classList.add('has-content');
	      } else {
	        titleElement.classList.remove('has-content');
	        titleElement.textContent = '';
	      }
	    } else {
	      // Enter edit mode
	      titleElement.classList.add('editing', 'has-content');
	      titleElement.contentEditable = 'true';
	      titleElement.focus();

	      // Select all text
	      const range = document.createRange();
	      range.selectNodeContents(titleElement);
	      const selection = globalThis.getSelection();
	      selection?.removeAllRanges();
	      selection?.addRange(range);
	    }
	  }

	  /**
	   * @param {HTMLDivElement} note
	   * @returns {void}
	   */
	  bringToFront (note) {
	    const maxZ = Math.max(...this.notes.map((n) => Number.parseInt(
	      n.element.style.zIndex || '1'
	    )));
	    note.style.zIndex = String(maxZ + 1);
	  }

	  /**
	   * @param {string} message
	   * @param {() => void} onConfirm
	   * @returns {void}
	   */
	  // eslint-disable-next-line class-methods-use-this -- Convenient
	  showConfirm (message, onConfirm) {
	    // Create overlay
	    const overlay = document.createElement('div');
	    overlay.className = 'sticky-note-confirm-overlay';

	    // Create dialog
	    const dialog = document.createElement('div');
	    dialog.className = 'sticky-note-confirm-dialog';

	    // Create message
	    const messageEl = document.createElement('div');
	    messageEl.className = 'sticky-note-confirm-message';
	    messageEl.textContent = message;

	    // Create buttons container
	    const buttonsEl = document.createElement('div');
	    buttonsEl.className = 'sticky-note-confirm-buttons';

	    // Create No button
	    const noBtn = document.createElement('button');
	    noBtn.className = 'sticky-note-confirm-btn sticky-note-confirm-btn-no';
	    noBtn.textContent = 'Cancel';
	    noBtn.addEventListener('click', () => {
	      overlay.remove();
	    });

	    // Create Yes button
	    const yesBtn = document.createElement('button');
	    yesBtn.className = 'sticky-note-confirm-btn sticky-note-confirm-btn-yes';
	    yesBtn.textContent = 'Delete';
	    yesBtn.addEventListener('click', () => {
	      overlay.remove();
	      onConfirm();
	    });

	    buttonsEl.append(noBtn);
	    buttonsEl.append(yesBtn);

	    dialog.append(messageEl);
	    dialog.append(buttonsEl);
	    overlay.append(dialog);

	    // Close on overlay click
	    overlay.addEventListener('click', (e) => {
	      if (e.target === overlay) {
	        overlay.remove();
	      }
	    });

	    document.body.append(overlay);

	    // Focus yes button
	    yesBtn.focus();
	  }

	  /**
	   * @param {HTMLDivElement} noteElement
	   * @returns {void}
	   */
	  deleteNote (noteElement) {
	    const index = this.notes.findIndex((n) => n.element === noteElement);
	    if (index !== -1) {
	      this.notes[index].element.remove();
	      const noteData = this.notes.splice(index, 1);
	      if (this.onDelete) {
	        this.onDelete(noteData[0]);
	      }
	    }
	  }

	  /**
	   * @param {(
	   *   noteInfo: NoteData, idx: number, arr: NoteData[]
	   * ) => boolean} [filter]
	   * @returns {Required<NoteInfo>[]}
	   */
	  getAllNotes (filter) {
	    const notes = filter
	      ? this.notes.filter((...args) => {
	        return filter(...args);
	      })
	      : this.notes;
	    return notes.map((n) => ({
	      id: n.element.dataset.id ?? '',
	      title: n.title.textContent,
	      html: n.content.innerHTML,
	      color: n.element.style.background,
	      x: Number.parseInt(n.element.style.left),
	      y: Number.parseInt(n.element.style.top),
	      width: n.element.offsetWidth,
	      height: n.element.offsetHeight,
	      zIndex: Number.parseInt(n.element.style.zIndex || '1'),
	      collapsed: n.element.classList.contains('collapsed'),
	      metadata: n.metadata || {}
	    }));
	  }

	  /**
	   * @param {NoteInfo[]} notesData
	   * @returns {void}
	   */
	  loadNotes (notesData) {
	    notesData.forEach((noteData) => {
	      this.createNote(noteData);
	    });
	  }

	  /**
	   * @param {(
	   *   noteInfo: NoteData, idx: number, arr: NoteData[]
	   * ) => boolean} [filter]
	   * @returns {void}
	   */
	  clear (filter) {
	    const notes = filter
	      ? this.notes.filter((...args) => {
	        return filter(...args);
	      })
	      : [...this.notes];
	    notes.forEach((n) => {
	      n.element.remove();
	      const idx = this.notes.indexOf(n);
	      if (idx !== -1) {
	        this.notes.splice(idx, 1);
	      }
	    });
	  }
	}

	const stickyNotes = new StickyNote({
	  colors: ['#fff740', '#ff7eb9', '#7afcff', '#feff9c', '#a7ffeb', '#c7ceea'],
	  onDelete (note) {
	    const notes = stickyNotes.getAllNotes(({metadata}) => {
	      return metadata.type === 'local' &&
	        metadata.path === note.metadata.path;
	    });
	    if (note.metadata.type === 'local') {
	      localStorage.setItem(
	        `stickyNotes-local-${note.metadata.path}`, JSON.stringify(notes)
	      );
	    } else {
	      localStorage.setItem(
	        `stickyNotes-global`, JSON.stringify(notes)
	      );
	    }
	  }
	});

	/**
	 * @param {import('stickynote').NoteData} note
	 * @param {string} pth
	 */
	const addLocalStickyInputListeners = (note, pth) => {
	  const saveNotes = () => {
	    const notes = stickyNotes.getAllNotes(({metadata}) => {
	      return metadata.type === 'local' &&
	        metadata.path === note.metadata.path;
	    });
	    localStorage.setItem(
	      `stickyNotes-local-${pth}`, JSON.stringify(notes)
	    );
	  };
	  note.content.addEventListener('input', () => {
	    saveNotes();
	  });

	  const noteElement = note.element;
	  let saveTimeout;
	  const noteObserver = new MutationObserver(function (mutationsList) {
	    for (const mutation of mutationsList) {
	      if (mutation.attributeName === 'class' ||
	        mutation.attributeName === 'data-color-index'
	      ) {
	        // mutation.target.classList.contains('collapsed')
	        saveNotes();
	      } else if (mutation.attributeName === 'style') {
	        // Debounce style changes (position during drag)
	        clearTimeout(saveTimeout);
	        saveTimeout = setTimeout(saveNotes, 300);
	      }
	    }
	  });
	  if (noteElement) {
	    const config = {
	      attributes: true,
	      attributeFilter: ['class', 'data-color-index', 'style']
	    };
	    noteObserver.observe(noteElement, config);
	  }

	  const titleObserver = new MutationObserver(function (mutationsList) {
	    for (const mutation of mutationsList) {
	      if (mutation.attributeName === 'class') {
	        // mutation.target.classList.contains('collapsed')
	        saveNotes();
	      }
	    }
	  });
	  const titleElement = note.title;
	  if (titleElement) {
	    const config = {attributes: true, attributeFilter: ['class']};
	    titleObserver.observe(titleElement, config);
	  }

	  // To stop observing later:
	  // noteObserver.disconnect();
	};

	/**
	 * @param {import('stickynote').NoteData} note
	 */
	const addGlobalStickyInputListeners = (note) => {
	  const saveNotes = () => {
	    const notes = stickyNotes.getAllNotes(({metadata}) => {
	      return metadata.type === 'global';
	    });
	    localStorage.setItem(
	      `stickyNotes-global`, JSON.stringify(notes)
	    );
	  };
	  note.content.addEventListener('input', () => {
	    saveNotes();
	  });

	  const noteElement = note.element;
	  let saveTimeout;
	  const noteObserver = new MutationObserver(function (mutationsList) {
	    for (const mutation of mutationsList) {
	      if (mutation.attributeName === 'class' ||
	        mutation.attributeName === 'data-color-index'
	      ) {
	        // mutation.target.classList.contains('collapsed')
	        saveNotes();
	      } else if (mutation.attributeName === 'style') {
	        // Debounce style changes (position during drag)
	        clearTimeout(saveTimeout);
	        saveTimeout = setTimeout(saveNotes, 300);
	      }
	    }
	  });
	  if (noteElement) {
	    const config = {
	      attributes: true,
	      attributeFilter: ['class', 'data-color-index', 'style']
	    };
	    noteObserver.observe(noteElement, config);
	  }

	  const titleObserver = new MutationObserver(function (mutationsList) {
	    for (const mutation of mutationsList) {
	      if (mutation.attributeName === 'class') {
	        // mutation.target.classList.contains('collapsed')
	        saveNotes();
	      }
	    }
	  });
	  const titleElement = note.title;
	  if (titleElement) {
	    const config = {attributes: true, attributeFilter: ['class']};
	    titleObserver.observe(titleElement, config);
	  }

	  // To stop observing later:
	  // noteObserver.disconnect();
	};

	// Clipboard for copy/paste operations
	/** @type {{path: string, isCopy: boolean} | null} */
	let clipboard = null;

	// Expose clipboard for testing via getter/setter
	Object.defineProperty(globalThis, 'clipboard', {
	  get () {
	    return clipboard;
	  },
	  /* c8 ignore next 3 -- Provided for completeness */
	  set (value) {
	    clipboard = value;
	  }
	});

	/**
	 * Get the current clipboard value.
	 * @returns {{path: string, isCopy: boolean} | null}
	 */
	const getClipboard = () => clipboard;

	/**
	 * Set the clipboard value.
	 * @param {{path: string, isCopy: boolean} | null} value
	 */
	const setClipboard = (value) => {
	  clipboard = value;
	};

	/**
	 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
	 */

	/** @type {JQuery} */
	let $columns;

	let isDeleting = false;
	let isCreating = false;
	let isCopyingOrMoving = false;
	let isWatcherRefreshing = false;

	/**
	 * Set the $columns value.
	 * @param {JQuery} value
	 */
	const set$columns = (value) => {
	  $columns = value;
	};

	/**
	 * Set the isDeleting flag.
	 * @param {boolean} value
	 */
	const setIsDeleting = (value) => {
	  isDeleting = value;
	};

	/**
	 * Set the isCreating flag.
	 * @param {boolean} value
	 */
	const setIsCreating = (value) => {
	  isCreating = value;
	};

	/**
	 * Set the isCopyingOrMoving flag.
	 * @param {boolean} value
	 */
	const setIsCopyingOrMoving = (value) => {
	  isCopyingOrMoving = value;
	};

	/**
	 * Get the isCopyingOrMoving flag.
	 * @returns {boolean}
	 */
	const getIsCopyingOrMoving = () => isCopyingOrMoving;

	/**
	 * Set the isWatcherRefreshing flag.
	 * @param {boolean} value
	 */
	const setIsWatcherRefreshing = (value) => {
	  isWatcherRefreshing = value;
	};

	/* eslint-disable n/no-sync -- Needed for performance */
	// Get Node APIs from the preload script
	const {
	  fs: {existsSync: existsSync$2, rmSync: rmSync$1, mkdirSync: mkdirSync$2, writeFileSync: writeFileSync$1, renameSync: renameSync$2},
	  spawnSync: spawnSync$3,
	  path: path$3,
	  os: os$1
	} = globalThis.electronAPI;

	// Use same undo backup directory as operations.js
	const undoBackupDir$1 = path$3.join(os$1.tmpdir(), 'filebrowser-undo-backups');
	try {
	  if (!existsSync$2(undoBackupDir$1)) {
	    mkdirSync$2(undoBackupDir$1, {recursive: true});
	  }
	/* c8 ignore next 4 -- Defensive: mkdir failure is rare */
	} catch (err) {
	  // eslint-disable-next-line no-console -- Startup logging
	  console.error('Failed to create undo backup directory:', err);
	}

	/**
	 * @typedef UndoAction
	 * @property {'create'|'delete'|'rename'|'move'|'copy'|'replace'} type
	 * @property {string} path - The path involved in the operation
	 * @property {string} [oldPath] - For rename/move operations
	 * @property {string} [newPath] - For rename/move operations
	 * @property {boolean} [wasDirectory] - For delete operations
	 * @property {string} [backupPath] - For delete/replace operations (temp backup)
	 */

	/** @type {UndoAction[]} */
	const undoStack = [];
	/** @type {UndoAction[]} */
	const redoStack = [];
	const MAX_UNDO_STACK_SIZE = 50;

	// Expose for testing
	globalThis.undoStack = undoStack;
	globalThis.redoStack = redoStack;

	/**
	 * Add an action to the undo stack.
	 * @param {UndoAction} action
	 */
	const pushUndo = (action) => {
	  undoStack.push(action);
	  /* c8 ignore next 3 -- Difficult to test */
	  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
	    undoStack.shift();
	  }
	  // Clear redo stack when a new action is performed
	  redoStack.length = 0;
	};

	/**
	 * Perform undo operation.
	 * @param {() => void} changePath - Function to refresh the view
	 */
	const performUndo$1 = (changePath) => {
	  const action = undoStack.pop();
	  if (!action) {
	    return;
	  }

	  try {
	    switch (action.type) {
	    case 'copy':
	    case 'create': {
	      // Undo create/copy: delete the created/copied item
	      if (existsSync$2(action.path)) {
	        rmSync$1(action.path, {recursive: true, force: true});
	        redoStack.push(action);
	      }
	      break;
	    }
	    case 'delete': {
	      // Undo delete: restore from backup
	      if (action.backupPath && existsSync$2(action.backupPath)) {
	        const cpResult = spawnSync$3(
	          'cp',
	          ['-R', action.backupPath, action.path]
	        );
	        if (cpResult.status === 0) {
	          // Clean up backup
	          rmSync$1(action.backupPath, {recursive: true, force: true});
	          redoStack.push({...action, backupPath: undefined});
	        }
	      }
	      break;
	    }
	    case 'rename':
	    case 'move': {
	      // Undo rename/move: move back to old location
	      if (action.newPath && action.oldPath && existsSync$2(action.newPath)) {
	        renameSync$2(action.newPath, action.oldPath);
	        redoStack.push(action);
	      }
	      break;
	    }
	    case 'replace': {
	      // Undo replace: restore the replaced item from backup
	      if (action.backupPath && existsSync$2(action.backupPath)) {
	        // Remove the new item
	        if (existsSync$2(action.path)) {
	          rmSync$1(action.path, {recursive: true, force: true});
	        }
	        // Restore the backed-up item
	        const cpResult = spawnSync$3(
	          'cp',
	          ['-R', action.backupPath, action.path]
	        );
	        if (cpResult.status === 0) {
	          redoStack.push(action);
	        }
	      }
	      break;
	    }
	    /* c8 ignore next 3 -- Guard */
	    default:
	      throw new Error('Unexpected undo operation');
	    }
	    changePath();
	  /* c8 ignore next 4 -- Guard */
	  } catch (err) {
	    // eslint-disable-next-line no-alert -- User feedback
	    alert('Failed to undo: ' + (/** @type {Error} */ (err)).message);
	  }
	};

	/**
	 * Perform redo operation.
	 * @param {() => void} changePath - Function to refresh the view
	 */
	const performRedo$1 = (changePath) => {
	  const action = redoStack.pop();
	  if (!action) {
	    return;
	  }

	  try {
	    switch (action.type) {
	    case 'create': {
	      // Redo create: recreate the item
	      if (!existsSync$2(action.path)) {
	        if (action.wasDirectory) {
	          mkdirSync$2(action.path);
	        } else {
	          writeFileSync$1(action.path, '');
	        }
	        undoStack.push(action);
	      }
	      break;
	    }
	    case 'delete': {
	      // Redo delete: delete again
	      if (existsSync$2(action.path)) {
	        // Create backup for potential undo
	        const timestamp = Date.now();
	        const safeName = path$3.basename(action.path).
	          replaceAll(/[^\w.]/gv, '_');
	        const backupName = `${safeName}.undo-backup-${timestamp}`;
	        const backupPath = path$3.join(undoBackupDir$1, backupName);
	        const cpResult = spawnSync$3('cp', ['-R', action.path, backupPath]);
	        if (cpResult.status === 0) {
	          rmSync$1(action.path, {recursive: true, force: true});
	          undoStack.push({...action, backupPath});
	        }
	      }
	      break;
	    }
	    case 'rename':
	    case 'move': {
	      // Redo rename/move: move forward again
	      if (action.oldPath && action.newPath && existsSync$2(action.oldPath)) {
	        renameSync$2(action.oldPath, action.newPath);
	        undoStack.push(action);
	      }
	      break;
	    }
	    case 'copy': {
	      // Redo copy: copy again
	      if (action.oldPath && !existsSync$2(action.path)) {
	        const cpResult = spawnSync$3('cp', ['-R', action.oldPath, action.path]);
	        if (cpResult.status === 0) {
	          undoStack.push(action);
	        }
	      }
	      break;
	    }
	    case 'replace': {
	      // Redo replace: remove backup and keep the new item
	      if (action.backupPath && existsSync$2(action.backupPath)) {
	        // Just remove the backup - the replaced item should already be there
	        rmSync$1(action.backupPath, {recursive: true, force: true});
	        undoStack.push({...action, backupPath: undefined});
	      }
	      break;
	    }
	    /* c8 ignore next 3 -- Guard */
	    default:
	      throw new Error('Unexpected redo operation');
	    }
	    changePath();
	  /* c8 ignore next 4 -- Guard */
	  } catch (err) {
	    // eslint-disable-next-line no-alert -- User feedback
	    alert('Failed to redo: ' + (/** @type {Error} */ (err)).message);
	  }
	};

	/**
	 * Simple event bus for decoupling modules.
	 * Allows modules to emit events and subscribe to events without
	 * direct dependencies.
	 */

	/**
	 * @callback EventCallback
	 * @param {unknown} [data]
	 * @returns {void}
	 */

	/** @type {Map<string, Set<EventCallback>>} */
	const listeners = new Map();

	/**
	 * Subscribe to an event.
	 * @param {string} eventName
	 * @param {EventCallback} handler
	 * @returns {() => void} Unsubscribe function
	 */
	function on (eventName, handler) {
	  if (!listeners.has(eventName)) {
	    listeners.set(eventName, new Set());
	  }
	  listeners.get(eventName).add(handler);

	  // Return unsubscribe function
	  /* c8 ignore next 7 - Unsubscribe function not used in current
	     implementation */
	  return () => {
	    const eventListeners = listeners.get(eventName);
	    if (eventListeners) {
	      eventListeners.delete(handler);
	    }
	  };
	}

	/**
	 * Emit an event with optional data.
	 * @param {string} eventName
	 * @param {unknown} [data]
	 */
	function emit (eventName, data) {
	  const eventListeners = listeners.get(eventName);
	  if (eventListeners) {
	    eventListeners.forEach((handler) => {
	      try {
	        handler(data);
	      /* c8 ignore next 4 - Defensive: handler errors unlikely in tests */
	      } catch (err) {
	        // eslint-disable-next-line no-console -- Error handling
	        console.error(`Error in event listener for "${eventName}":`, err);
	      }
	    });
	  }
	}

	/* eslint-disable n/no-sync -- Needed for performance */

	// Get Node APIs from the preload script
	const {
	  fs: {existsSync: existsSync$1, lstatSync: lstatSync$1, rmSync, renameSync: renameSync$1, mkdirSync: mkdirSync$1},
	  path: path$2,
	  spawnSync: spawnSync$2,
	  os
	} = globalThis.electronAPI;

	// Create undo backup directory in system temp folder
	const undoBackupDir = path$2.join(os.tmpdir(), 'filebrowser-undo-backups');
	try {
	  if (!existsSync$1(undoBackupDir)) {
	    mkdirSync$1(undoBackupDir, {recursive: true});
	  }
	/* c8 ignore next 4 -- Defensive: mkdir failure is rare */
	} catch (err) {
	  // eslint-disable-next-line no-console -- Startup logging
	  console.error('Failed to create undo backup directory:', err);
	}

	/**
	 * @typedef {import('../history/undoRedo.js').UndoAction} UndoAction
	 */

	/**
	 * Delete a file or directory.
	 * @param {string} itemPath
	 */
	function deleteItem (itemPath) {
	  // Prevent multiple simultaneous deletions
	  if (isDeleting) {
	    return;
	  }

	  setIsDeleting(true);

	  const decodedPath = decodeURIComponent(itemPath);
	  const itemName = path$2.basename(decodedPath);

	  // eslint-disable-next-line no-alert -- User confirmation
	  const confirmed = confirm(`Are you sure you want to delete "${itemName}"?`);

	  if (!confirmed) {
	    setIsDeleting(false);
	    return;
	  }

	  try {
	    // Create a backup before deleting for undo support
	    const timestamp = Date.now();
	    const safeName = path$2.basename(decodedPath).
	      replaceAll(/[^\w.\-]/gv, '_');
	    const backupName = `${safeName}.undo-backup-${timestamp}`;
	    const backupPath = path$2.join(undoBackupDir, backupName);
	    const cpResult = spawnSync$2('cp', ['-R', decodedPath, backupPath]);

	    /* c8 ignore next 3 - Defensive: requires cp command to fail */
	    if (cpResult.error || cpResult.status !== 0) {
	      throw new Error('Failed to create backup for undo');
	    }

	    // Check if it's a directory
	    const stats = lstatSync$1(decodedPath);
	    const wasDirectory = stats.isDirectory();

	    // rmSync with recursive and force options to handle both files
	    //   and directories
	    rmSync(decodedPath, {recursive: true, force: true});

	    // Add to undo stack via event
	    emit('pushUndo', {
	      type: 'delete',
	      path: decodedPath,
	      wasDirectory,
	      backupPath
	    });

	    // Refresh the view to reflect deletion
	    emit('refreshView');

	    // Reset flag after a delay to allow view to update
	    setTimeout(() => {
	      setIsDeleting(false);
	    }, 100);

	    // Note: Delete error handling here
	    // is difficult to test via mocking because rmSync is destructured at
	    // module load time, preventing runtime mocking. This would require
	    // either modifying the source to use property access instead of
	    // destructuring, or creating actual filesystem permission errors which
	    // is complex and platform-dependent. These lines are marked as
	    // difficult to cover and require manual/integration testing.
	    /* c8 ignore next 5 -- Defensive and difficult to cover */
	  } catch (err) {
	    // eslint-disable-next-line no-alert -- User feedback
	    alert('Failed to delete: ' + (/** @type {Error} */ (err)).message);
	    setIsDeleting(false);
	  }
	}

	// Track last operation to prevent duplicate dialogs
	let lastOperationKey = '';
	let lastOperationTime = 0;
	let operationCounter = 0;

	/**
	 * Copy or move an item.
	 * @param {string} sourcePath
	 * @param {string} targetDir
	 * @param {boolean} isCopy
	 */
	function copyOrMoveItem (sourcePath, targetDir, isCopy) {
	  // Check and block IMMEDIATELY before doing anything else
	  if (operationCounter > 0) {
	    return;
	  }

	  // Set counter immediately to block subsequent calls
	  operationCounter = 1;

	  // Build operation key for deduplication
	  const operationKey = `${sourcePath}:${targetDir}:${isCopy}`;
	  const now = Date.now();

	  // Check for duplicate operation within 500ms
	  if (operationKey === lastOperationKey && now - lastOperationTime < 500) {
	    operationCounter = 0;
	    return;
	  }

	  // Update tracking variables
	  lastOperationKey = operationKey;
	  lastOperationTime = now;
	  setIsCopyingOrMoving(true);

	  const decodedSource = decodeURIComponent(sourcePath);
	  const decodedTargetDir = decodeURIComponent(targetDir);
	  const itemName = path$2.basename(decodedSource);
	  const targetPath = path$2.join(decodedTargetDir, itemName);

	  // Silently ignore if dragging to the same location or onto itself
	  if (decodedSource === targetPath || decodedSource === decodedTargetDir) {
	    operationCounter = 0;
	    setIsCopyingOrMoving(false);
	    return;
	  }

	  // Prevent moving/copying a folder into its own descendant
	  if (decodedTargetDir.startsWith(decodedSource + path$2.sep) ||
	      decodedTargetDir === decodedSource) {
	    // eslint-disable-next-line no-alert -- User feedback
	    alert('Cannot copy or move a folder into itself or its descendants.');
	    operationCounter = 0;
	    setIsCopyingOrMoving(false);
	    return;
	  }

	  // Check if target already exists
	  if (existsSync$1(targetPath)) {
	    // Check if source is inside the target that would be replaced
	    // This would cause the source to be deleted before the operation
	    if (decodedSource.startsWith(targetPath + path$2.sep) ||
	        path$2.dirname(decodedSource) === targetPath) {
	      // eslint-disable-next-line no-alert -- User feedback
	      alert('Cannot replace a folder with one of its own contents.');
	      operationCounter = 0;
	      setIsCopyingOrMoving(false);
	      return;
	    }

	    // eslint-disable-next-line no-alert -- User feedback
	    const shouldReplace = confirm(
	      `"${itemName}" already exists in the destination.\n\n` +
	      'Click OK to replace the existing item, or Cancel to stop.'
	    );

	    if (!shouldReplace) {
	      operationCounter = 0;
	      setIsCopyingOrMoving(false);
	      return;
	    }

	    // Create backup of the existing file/folder for undo
	    try {
	      const timestamp = Date.now();
	      const sanitizedPath = targetPath.replaceAll(/[^a-zA-Z\d]/gv, '_');
	      const backupPath = path$2.join(
	        undoBackupDir,
	        `${sanitizedPath}_${timestamp}`
	      );

	      // Copy existing item to backup before replacing
	      const backupResult = spawnSync$2('cp', ['-R', targetPath, backupPath]);
	      /* c8 ignore next 3 - Defensive: requires backup to fail */
	      if (backupResult.error || backupResult.status !== 0) {
	        throw new Error('Failed to create backup');
	      }

	      // Remove the existing item
	      rmSync(targetPath, {recursive: true, force: true});

	      // Store backup info for potential undo
	      emit('pushUndo', {
	        type: 'replace',
	        path: targetPath,
	        backupPath
	      });
	    /* c8 ignore next 6 - Defensive: backup failures are rare */
	    } catch (err) {
	      // eslint-disable-next-line no-alert -- User feedback
	      alert(`Failed to replace: ${(/** @type {Error} */ (err)).message}`);
	      operationCounter = 0;
	      setIsCopyingOrMoving(false);
	      return;
	    }
	  }

	  try {
	    if (isCopy) {
	      // Copy operation using cp -R for recursive copy
	      const cpResult = spawnSync$2('cp', ['-R', decodedSource, targetPath]);
	      /* c8 ignore next 3 - Defensive: requires cp command to fail */
	      if (cpResult.error || cpResult.status !== 0) {
	        throw new Error(cpResult.stderr?.toString() || 'Copy failed');
	      }
	      // Add to undo stack via event
	      emit('pushUndo', {
	        type: 'copy',
	        path: targetPath,
	        oldPath: decodedSource
	      });
	    /* c8 ignore next 12 - Move operation not yet implemented in UI
	       (no cut/paste for moving between directories) */
	    } else {
	      // Move operation
	      renameSync$1(decodedSource, targetPath);
	      // Add to undo stack via event
	      emit('pushUndo', {
	        type: 'move',
	        path: targetPath,
	        oldPath: decodedSource,
	        newPath: targetPath
	      });
	    }

	    // Refresh the view
	    emit('refreshView');

	    // Reset flag after a short delay
	    setTimeout(() => {
	      operationCounter = 0;
	      setIsCopyingOrMoving(false);
	    }, 100);
	  /* c8 ignore next 7 - Defensive: difficult to trigger errors in cp/rename */
	  } catch (err) {
	    // eslint-disable-next-line no-alert -- User feedback
	    alert(
	      `Failed to ${isCopy ? 'copy' : 'move'}: ` +
	      (/** @type {Error} */ (err)).message
	    );
	    operationCounter = 0;
	    setIsCopyingOrMoving(false);
	  }
	}

	/* eslint-disable n/no-sync -- Needed for performance */

	// Get Node APIs from the preload script
	const {
	  fs: {realpathSync},
	  path: path$1,
	  parcelWatcher
	} = globalThis.electronAPI;

	// Map of directory paths to their watcher subscriptions
	// eslint-disable-next-line jsdoc/reject-any-type -- Watcher type
	/** @type {Map<string, any>} */
	const activeWatchers = new Map();
	/** @type {Set<string>} */
	const foldersWithPendingChanges$1 = new Set();

	/**
	 * Setup file system watcher for a directory.
	 * Now uses parcel watcher exclusively.
	 *
	 * @param {string} dirPath
	 * @returns {void}
	 */
	function setupFileWatcher (dirPath) {
	  // Don't recreate watcher during external refresh
	  if (isWatcherRefreshing) {
	    return;
	  }

	  // Don't watch root directory
	  if (dirPath === '/') {
	    return;
	  }

	  // Don't recreate watcher if already watching this path
	  if (activeWatchers.has(dirPath)) {
	    return;
	  }

	  // Use parcel watcher for all cases
	  setupNativeWatcher(dirPath);
	}

	/**
	 * Setup a parcel/watcher as fallback.
	 *
	 * @param {string} dirPath
	 * @returns {Promise<void>}
	 */
	async function setupNativeWatcher (dirPath) {
	  /* c8 ignore next 3 - Unreachable: setupFileWatcher filters root first */
	  if (dirPath === '/') {
	    return;
	  }

	  /* c8 ignore next 5 - Defensive: setupFileWatcher already checks,
	     but kept for safety if called directly in future */
	  // Check if already watching this path
	  if (activeWatchers.has(dirPath)) {
	    return;
	  }

	  // Resolve symlinks to get the real path
	  // (e.g., /tmp -> /private/tmp on macOS)
	  let resolvedDirPath;
	  try {
	    resolvedDirPath = realpathSync(dirPath);
	  /* c8 ignore next 5 - Defensive:
	     hard to mock due to module-level binding */
	  // If path doesn't exist or can't be resolved, use original
	  } catch {
	    resolvedDirPath = dirPath;
	  }

	  let debounceTimer = /** @type {NodeJS.Timeout | null} */ (null);

	  try {
	    // Use @parcel/watcher which is more efficient
	    // and tracks subdirectories
	    const subscription = await parcelWatcher.subscribe(
	      resolvedDirPath,
	      (err, events) => {
	        /* c8 ignore next 6 - Error handler for parcel watcher failures,
	           difficult to trigger in integration tests */
	        if (err) {
	          // eslint-disable-next-line no-console -- Debugging
	          console.error('Parcel watcher error:', err);
	          return;
	        }

	        // Filter events to include direct children and first-level
	        // subdirectories (depth 0 and depth 1 only)
	        const relevantEvents = events.filter((evt) => {
	          const relativePath = evt.path.slice(resolvedDirPath.length + 1);
	          // Count slashes to determine depth
	          const slashCount = (relativePath.match(/\//gv) || []).length;
	          // Include depth 0 (direct children) and depth 1
	          // (files in direct child folders)
	          return slashCount <= 1;
	        });

	        // Skip if no relevant events
	        if (relevantEvents.length === 0) {
	          return;
	        }

	        // Get currently selected item
	        // In miller-columns, there can be multiple selected items
	        //   (one per column). We want the rightmost (deepest) one
	        const allSelected = $$(
	          'li.miller-selected a, li.miller-selected span'
	        );
	        const selectedItem = allSelected.length > 0
	          ? allSelected.at(-1)
	          : null;
	        const selectedPath = selectedItem
	          ? /** @type {HTMLElement} */ (selectedItem).dataset.path
	          : null;

	        // Track which folders have changes
	        // (for later refresh when visited)
	        let changeInSelectedFolder = false;
	        let changeInVisibleArea = false;
	        const columnsToRefresh = new Set();

	        // Get current base path being viewed
	        const currentBasePath = getBasePath();

	        // Check each event against the watched folder
	        for (const evt of relevantEvents) {
	          const eventPath = evt.path;
	          const eventDir = path$1.dirname(eventPath);

	          // Ignore macOS Trash events
	          // – moving items there shouldn't refresh
	          if (eventDir.includes('/.Trash')) {
	            continue;
	          }

	          // Track this folder as having pending changes
	          foldersWithPendingChanges$1.add(eventDir);

	          // Check if change is in the current base path (root being viewed)
	          // Normalize paths for comparison
	          // (currentBasePath has trailing slash)
	          // Also resolve symlinks (macOS /tmp -> /private/tmp)
	          const normalizedEventDir = path$1.normalize(eventDir + '/');
	          try {
	            const resolvedEventDir = realpathSync(normalizedEventDir);
	            const resolvedCurrentBasePath = realpathSync(currentBasePath);
	            if (resolvedEventDir === resolvedCurrentBasePath) {
	              changeInVisibleArea = true;
	              columnsToRefresh.add(currentBasePath);
	            }
	          } catch {
	            // If realpathSync fails (e.g., path doesn't exist), fall back to
	            // simple string comparison
	            /* c8 ignore start */
	            // Defensive: Hard to test scenario
	            // where both paths throw but match
	            if (normalizedEventDir === currentBasePath) {
	              changeInVisibleArea = true;
	              columnsToRefresh.add(currentBasePath);
	            }
	            /* c8 ignore stop */
	          }

	          // Check if change affects visible columns
	          if (selectedPath) {
	            const decodedSelectedPath = decodeURIComponent(selectedPath);
	            const selectedDir = path$1.dirname(decodedSelectedPath);

	            // Resolve symlinks for path comparison
	            let resolvedEventDir = eventDir;
	            let resolvedSelectedDir = selectedDir;
	            let resolvedDecodedSelectedPath = decodedSelectedPath;
	            try {
	              resolvedEventDir = realpathSync(eventDir);
	              resolvedSelectedDir = realpathSync(selectedDir);
	              resolvedDecodedSelectedPath = realpathSync(
	                decodedSelectedPath
	              );
	            } catch {
	              // If resolution fails, use original paths
	            }

	            // Case 1: Change in selected folder's children (if folder)
	            if (resolvedDecodedSelectedPath === resolvedEventDir) {
	              changeInSelectedFolder = true;
	              changeInVisibleArea = true;
	            }

	            // Case 2: Change in selected item's siblings (same parent)
	            if (resolvedSelectedDir === resolvedEventDir) {
	              changeInVisibleArea = true;
	              columnsToRefresh.add(selectedDir);
	            }

	            // Case 2b: Change in sibling folder
	            // (different child, same parent)
	            // Check if eventDir's parent matches selectedDir's parent
	            const eventDirParent = path$1.dirname(resolvedEventDir);
	            const selectedDirParent = path$1.dirname(resolvedSelectedDir);
	            if (eventDirParent === selectedDirParent &&
	                resolvedEventDir !== resolvedSelectedDir) {
	              changeInVisibleArea = true;
	              columnsToRefresh.add(eventDir); // Add the sibling folder path
	            }

	            // Case 3: Change in ancestor columns
	            // (visible parent/grandparent)
	            // Walk up the selected path to check all visible ancestors
	            let ancestorPath = selectedDir;
	            while (
	              ancestorPath && ancestorPath !== '/' && ancestorPath !== '.'
	            ) {
	              let resolvedAncestorPath = ancestorPath;
	              try {
	                resolvedAncestorPath = realpathSync(ancestorPath);
	              } catch {
	                // Use original if resolution fails
	              }

	              if (resolvedAncestorPath === resolvedEventDir) {
	                changeInVisibleArea = true;
	                columnsToRefresh.add(eventDir);
	                break;
	              }
	              const nextAncestor = path$1.dirname(ancestorPath);
	              /* c8 ignore next 4 - Defensive break, unreachable because
	                 while condition exits when ancestorPath === '/' */
	              if (nextAncestor === ancestorPath) {
	                break;
	              }
	              ancestorPath = nextAncestor;
	            }
	          }
	        }

	        // Debounce to avoid multiple rapid refreshes
	        if (debounceTimer) {
	          clearTimeout(debounceTimer);
	        }

	        debounceTimer = setTimeout(() => {
	          if (isDeleting || isCreating || isWatcherRefreshing) {
	            return;
	          }

	          // Refresh visible changes
	          if (changeInVisibleArea) {
	            // Set flag to prevent concurrent refreshes
	            setIsWatcherRefreshing(true);

	            // If change was in selected folder's children, refresh it
	            if (changeInSelectedFolder && selectedPath) {
	              const itemElement = $(
	                `[data-path="${CSS.escape(selectedPath)}"]`
	              );
	              if (itemElement) {
	                const li = itemElement.closest('li');
	                if (li) {
	                  jQuery(li).trigger('click');
	                }
	              }
	            }

	            // Refresh any ancestor columns that changed
	            let refreshHandled = false;

	            // Check if any changed paths are the current base path
	            // (root directory being viewed)
	            const rootChanged = columnsToRefresh.has(currentBasePath);

	            if (rootChanged) {
	              // Root directory changed - reload entire view
	              // Preserve selection if something was selected
	              const previouslySelectedPath = selectedPath;
	              setTimeout(() => {
	                emit('refreshView');

	                // After refresh, re-select the previously selected item
	                if (previouslySelectedPath) {
	                  requestAnimationFrame(() => {
	                    requestAnimationFrame(() => {
	                      const escapedPath = CSS.escape(
	                        previouslySelectedPath
	                      );
	                      const reselect = $(`[data-path="${escapedPath}"]`);

	                      if (reselect) {
	                        const reselectLi = reselect.closest('li');
	                        if (reselectLi) {
	                          jQuery(reselectLi).trigger('click');
	                        }
	                      }

	                      setIsWatcherRefreshing(false);
	                    });
	                  });
	                /* c8 ignore next 3 -- Difficult to cover? */
	                } else {
	                  setIsWatcherRefreshing(false);
	                }
	              }, 150);
	              refreshHandled = true;
	            }

	            /**
	             * Clear refresh flag helper.
	             * @returns {void}
	             */
	            const clearRefreshFlag = () => {
	              setTimeout(() => {
	                setIsWatcherRefreshing(false);
	              }, 300);
	            };

	            for (const columnPath of columnsToRefresh) {
	              if (refreshHandled) {
	                break;
	              }

	              // Special case: if the changed path is an ancestor of current
	              // path but not directly visible as a folder element, we need to
	              // rebuild the leftmost column that shows this path's contents
	              // Resolve currentBasePath for comparison with columnPath
	              let resolvedCurrentBasePath = currentBasePath;
	              try {
	                resolvedCurrentBasePath = realpathSync(currentBasePath);
	              /* c8 ignore next 3 -- Defensive code */
	              } catch {
	                // Use original if resolution fails
	              }

	              if (resolvedCurrentBasePath.startsWith(columnPath + '/') &&
	                resolvedCurrentBasePath !== columnPath + '/'
	              ) {
	                // The changed directory is an ancestor
	                // We need to reload the entire view to refresh it
	                setTimeout(() => emit('refreshView'), 150);
	                clearRefreshFlag();
	                refreshHandled = true;
	                break;
	              }

	              // Find the folder element that represents this directory
	              // We need to find an <a> tag whose data-path equals
	              //   this directory
	              const allFolders = $$active('a[data-path]');

	              /* c8 ignore start -- Folder element refresh: Complex
	                 integration requiring precise folder structure and timing.
	                 Main folder refresh tested; edge cases difficult to reach. */
	              for (const folderEl of allFolders) {
	                const folderPath = decodeURIComponent(
	                  /* c8 ignore next -- TS */
	                  /** @type {HTMLElement} */ (folderEl).dataset.path || ''
	                );

	                // Resolve symlinks for comparison
	                let resolvedFolderPath = folderPath;
	                try {
	                  resolvedFolderPath = realpathSync(folderPath);
	                } catch {
	                  // Use original if resolution fails
	                }

	                // If this folder's path matches the changed directory
	                if (resolvedFolderPath === columnPath) {
	                  const li = folderEl.closest('li');
	                  if (li) {
	                    // Remember what was selected so we can restore it
	                    const previouslySelectedPath = selectedPath;

	                    // Save scroll positions of all columns before refresh
	                    const scrollPositions = new Map();
	                    $$('.miller-column').forEach((col) => {
	                      scrollPositions.set(col, {
	                        scrollTop: col.scrollTop,
	                        scrollLeft: col.scrollLeft
	                      });
	                    });

	                    // Add delay to let filesystem settle before refresh
	                    setTimeout(() => {
	                      // Re-click this folder to refresh its contents
	                      jQuery(li).trigger('click');

	                      // Restore scroll positions
	                      requestAnimationFrame(() => {
	                        scrollPositions.forEach((pos, col) => {
	                          col.scrollTop = pos.scrollTop;
	                          col.scrollLeft = pos.scrollLeft;
	                        });
	                      });

	                      // After refresh, re-select the previously selected item
	                      if (previouslySelectedPath) {
	                        requestAnimationFrame(() => {
	                          requestAnimationFrame(() => {
	                            const escapedPath = CSS.escape(
	                              previouslySelectedPath
	                            );
	                            const reselect = $(
	                              `[data-path="${escapedPath}"]`
	                            );

	                            if (reselect) {
	                              const reselectLi = reselect.closest('li');
	                              if (reselectLi) {
	                                jQuery(reselectLi).trigger('click');

	                                // Only scroll if item is out of viewport
	                                const rect = reselectLi.
	                                  getBoundingClientRect();
	                                const column = reselectLi.closest(
	                                  '.miller-column'
	                                );
	                                if (column) {
	                                  const colRect = column.
	                                    getBoundingClientRect();
	                                  const isVisible = (
	                                    rect.top >= colRect.top &&
	                                    rect.bottom <= colRect.bottom &&
	                                    rect.left >= colRect.left &&
	                                    rect.right <= colRect.right
	                                  );

	                                  /* c8 ignore next 8 -- Difficult to test:
	                                   * Requires folder element refresh (not root)
	                                   * with selected item out of viewport */
	                                  if (!isVisible) {
	                                    reselectLi.scrollIntoView({
	                                      block: 'nearest',
	                                      inline: 'nearest'
	                                    });
	                                  }
	                                }
	                              }
	                            }

	                            clearRefreshFlag();
	                          });
	                        });
	                      /* c8 ignore next 4 -- Difficult to test:
	                       * Requires folder element refresh without selection */
	                      } else {
	                        clearRefreshFlag();
	                      }
	                    }, 150); // Delay for filesystem to settle
	                    refreshHandled = true;
	                    break;
	                  }
	                }
	              }
	              /* c8 ignore stop */
	            }

	            // If no columns were refreshed, clear the flag
	            /* c8 ignore start - This case is currently unreachable
	             * because all code paths that set changeInVisibleArea=true
	             * also set either changeInSelectedFolder=true or add entries
	             * to columnsToRefresh, which would set refreshHandled=true.
	             * This is defensive code in case the logic changes. */
	            if (!refreshHandled) {
	              setIsWatcherRefreshing(false);
	            }
	            /* c8 ignore stop */
	          }
	        }, 500); // Debounce delay - wait for filesystem operations to settle
	      }
	    );

	    // Store the subscription in the map
	    activeWatchers.set(dirPath, subscription);

	  // Note: The parcelWatcher.subscribe error catch block
	  // is difficult to cover in automated tests because:
	  // 1. setupNativeWatcher is called during initial page load via refreshView
	  // 2. The activeWatchers Map caches watched paths, preventing repeated
	  //    subscribe calls on navigation
	  // 3. Mocking parcelWatcher.subscribe before page load would break all
	  //    watcher functionality, making it difficult to verify the specific
	  //    error path
	  // 4. The async nature of watcher setup (not awaited) makes timing
	  //    unreliable
	  // This error handling would require manual/integration testing or
	  // modification of the source code to expose setupNativeWatcher for
	  // direct unit testing.
	  /* c8 ignore next 4 -- Debugging -- Difficult to cover */
	  } catch (err) {
	    // eslint-disable-next-line no-console -- Debugging
	    console.warn('Could not set up parcel watcher:', err);
	  }
	}

	/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */

	/**
	 * Start renaming an item (file or folder).
	 *
	 * @param {object} deps - Dependencies
	 * @param {typeof import('path')} deps.path - Node path module
	 * @param {typeof import('jquery')} deps.jQuery - jQuery
	 * @param {(oldPath: string, newPath: string) => void} deps.renameSync
	 *   fs.renameSync
	 * @param {(path: string) => string} deps.decodeURIComponentFn
	 *   decodeURIComponent function
	 * @param {() => void} deps.changePath - Function to refresh the view
	 * @param {HTMLElement} [textElement] - Element to rename
	 * @param {(() => void)} [onComplete] - Callback when rename completes
	 * @returns {void}
	 */
	function startRename (
	  {path, jQuery, renameSync, decodeURIComponentFn, changePath},
	  textElement,
	  onComplete
	) {
	  if (!textElement || !textElement.dataset.path) {
	    // Call callback even if we exit early
	    if (onComplete) {
	      onComplete();
	    }
	    return;
	  }

	  // Check if already in rename mode (input exists)
	  if (textElement.querySelector('input')) {
	    // Call callback even if we exit early
	    if (onComplete) {
	      onComplete();
	    }
	    return;
	  }

	  const oldPath = textElement.dataset.path;
	  const oldName = textElement.textContent.trim();
	  const parentPath = path.dirname(oldPath);

	  // Create input element for renaming
	  const input = document.createElement('input');
	  input.type = 'text';
	  input.value = oldName;
	  input.style.width = '100%';
	  input.style.boxSizing = 'border-box';
	  input.style.position = 'relative';
	  input.style.zIndex = '9999'; // Above sticky headers
	  input.style.padding = '2px 4px';
	  input.style.border = '1px solid #ccc';
	  input.style.borderRadius = '2px';
	  input.style.backgroundColor = 'white';
	  input.style.color = 'black';

	  // Replace text with input
	  const originalContent = textElement.textContent;
	  textElement.textContent = '';
	  textElement.append(input);

	  // Focus and select the text
	  input.focus();
	  input.select();

	  let isFinishing = false;

	  const finishRename = () => {
	    if (isFinishing) {
	      return;
	    }
	    isFinishing = true;

	    const newName = input.value.trim();

	    if (newName && newName !== oldName) {
	      const newPath = path.join(parentPath, newName);

	      try {
	        // eslint-disable-next-line no-console -- Debugging
	        console.log('Starting rename from', oldName, 'to', newName);
	        // Set flag to prevent watcher from interfering during rename
	        setIsCreating(true);

	        renameSync(decodeURIComponentFn(oldPath), newPath);

	        // Add to undo stack
	        pushUndo({
	          type: 'rename',
	          path: newPath,
	          oldPath: decodeURIComponentFn(oldPath),
	          newPath
	        });

	        // eslint-disable-next-line no-console -- Debugging
	        console.log('Rename completed');

	        // Clear the flag immediately after rename so watcher
	        //   can detect change
	        // In three-columns mode, manually trigger parent refresh
	        const currentView = getCurrentView();
	        // eslint-disable-next-line no-console -- Debugging
	        console.log('Current view:', currentView);
	        if (currentView === 'three-columns') {
	          // Mark parent folder as having pending changes
	          foldersWithPendingChanges$1.add(parentPath);

	          // Find and click the parent folder to refresh it
	          const parentElements = $$active('a[data-path]');
	          let foundParent = false;
	          for (const el of parentElements) {
	            const elPath = decodeURIComponentFn(
	              /* c8 ignore next -- TS */
	              /** @type {HTMLElement} */ (el).dataset.path || ''
	            );
	            if (elPath === parentPath) {
	              foundParent = true;
	              const li = el.closest('li');
	              if (li) {
	                // Save scroll positions of all columns before refresh
	                /**
	                 * @type {Array<{
	                 *   index: number,
	                 *   path: string,
	                 *   scrollTop: number,
	                 *   scrollLeft: number
	                 * }>}
	                 */
	                const scrollPositions = [];
	                $$('.miller-column').forEach((col, index) => {
	                  // Get the directory path this column represents
	                  // by looking at any item's path and getting its parent dir
	                  const anyItem = col.querySelector(
	                    'a[data-path], span[data-path]'
	                  );
	                  let colDirPath = '';
	                  if (anyItem) {
	                    const itemPath = /** @type {HTMLElement} */ (anyItem).
	                      dataset.path;
	                    if (itemPath) {
	                      // Decode and get parent directory
	                      const decoded = decodeURIComponentFn(itemPath);
	                      colDirPath = path.dirname(decoded);
	                    }
	                  }
	                  scrollPositions.push({
	                    index,
	                    path: colDirPath,
	                    scrollTop: col.scrollTop,
	                    scrollLeft: col.scrollLeft
	                  });
	                });

	                // Trigger refresh
	                jQuery(li).trigger('click');

	                // After refresh, find and select the renamed item
	                setTimeout(() => {
	                  const encodedNewPath = parentPath + '/' +
	                    encodeURIComponent(newName);
	                  const renamedElement = $(
	                    `[data-path="${CSS.escape(encodedNewPath)}"]`
	                  );
	                  if (renamedElement) {
	                    const reselectLi = renamedElement.closest('li');
	                    if (reselectLi) {
	                      jQuery(reselectLi).trigger('click');

	                      // Restore scroll after plugin finishes rebuild
	                      // Plugin rebuilds columns async after click,
	                      // so wait for completion before restoring
	                      setTimeout(() => {
	                        // Get fresh column references after rebuild
	                        const newColumns = $$('.miller-column');

	                        // Restore scroll by matching paths, not indices
	                        newColumns.forEach((col) => {
	                          // Skip collapsed columns
	                          if (col.classList.contains('miller-collapse')) {
	                            return;
	                          }
	                          // Get the directory path this column represents
	                          const anyItem = col.querySelector(
	                            'a[data-path], span[data-path]'
	                          );
	                          let colDirPath = '';
	                          if (anyItem) {
	                            const itemPath = /** @type {HTMLElement} */
	                              (anyItem).dataset.path;
	                            if (itemPath) {
	                              const decoded = decodeURIComponentFn(itemPath);
	                              colDirPath = path.dirname(decoded);
	                            }
	                          }
	                          // Find saved scroll for this path
	                          const saved = scrollPositions.find(
	                            (sp) => sp.path === colDirPath
	                          );
	                          if (saved && saved.scrollTop > 0) {
	                            col.scrollTop = saved.scrollTop;
	                            col.scrollLeft = saved.scrollLeft;
	                          }
	                        });

	                        // Don't scroll the renamed item into view - trust
	                        // the restored scroll position preserves the user's
	                        // intended view

	                        // Clear the flag well after watcher debounce
	                        setTimeout(() => {
	                          setIsCreating(false);
	                        }, 600);
	                      }, 100);
	                    }
	                  }

	                  if (onComplete) {
	                    setTimeout(onComplete, 100);
	                  }
	                }, 200);
	                break;
	              }
	            }
	          }

	          if (!foundParent) {
	            // Clear the flag if parent not found
	            setTimeout(() => {
	              setIsCreating(false);
	            }, 800);
	          }
	        } else {
	          // For icon view, manually refresh
	          changePath();

	          // Re-select the renamed item after view refresh
	          setTimeout(() => {
	            const encodedNewPath = parentPath + '/' +
	              encodeURIComponent(newName);
	            const renamedElement = $(
	              `[data-path="${CSS.escape(encodedNewPath)}"]`
	            );
	            if (renamedElement) {
	              // Scroll into view
	              requestAnimationFrame(() => {
	                renamedElement.scrollIntoView({
	                  block: 'nearest',
	                  inline: 'nearest'
	                });
	              });
	            }

	            // Call completion callback after everything is done
	            if (onComplete) {
	              setTimeout(onComplete, 250);
	            } else {
	              // If no callback, just clear the flag after a delay
	              setTimeout(() => {
	                setIsCreating(false);
	              }, 250);
	            }
	          }, 100);
	        }
	      } catch (err) {
	        // eslint-disable-next-line no-alert -- User feedback
	        alert('Failed to rename: ' + (/** @type {Error} */ (err)).message);
	        input.remove();
	        textElement.textContent = originalContent;

	        // Call completion callback on error too
	        if (onComplete) {
	          onComplete();
	        }
	      }
	    } else {
	      // No rename needed, but still need to refresh to ensure proper state
	      input.remove();
	      textElement.textContent = originalContent;

	      // Get the path before refresh
	      const itemPath = oldPath;

	      // In three-columns mode, let the watcher handle refreshes
	      const currentView = getCurrentView();
	      if (currentView !== 'three-columns') {
	        // For icon view, manually refresh
	        changePath();
	      }

	      // Re-select the item after view refresh
	      setTimeout(() => {
	        const itemElement = $(
	          `[data-path="${CSS.escape(itemPath)}"]`
	        );
	        if (itemElement) {
	          if (currentView === 'three-columns') {
	            // Find container element for three-columns
	            const container = itemElement.closest('li');
	            if (container) {
	              // Remove selection from all items
	              $$('.miller-selected').
	                forEach((el) => {
	                  el.classList.remove('miller-selected');
	                });
	              // Select the item
	              container.classList.add('miller-selected');

	              // Focus the parent ul to enable keyboard navigation
	              // without triggering folder navigation
	              const parentUl = container.closest('ul');
	              if (parentUl) {
	                parentUl.setAttribute('tabindex', '0');
	                parentUl.focus();
	              }

	              // Scroll into view
	              container.scrollIntoView({
	                block: 'nearest',
	                inline: 'nearest'
	              });
	            }
	          } else {
	            // For icon-view, just scroll into view
	            itemElement.scrollIntoView({
	              block: 'nearest',
	              inline: 'nearest'
	            });
	          }
	        }

	        // Call completion callback after everything is done
	        if (onComplete) {
	          // Delay clearing the flag to ensure watcher timeout has passed
	          setTimeout(onComplete, 250);
	        }
	      }, currentView === 'three-columns' ? 350 : 100);
	    }
	  };

	  input.addEventListener('blur', finishRename);

	  input.addEventListener('keydown', (ev) => {
	    // Stop propagation to prevent miller-columns from handling these events
	    ev.stopPropagation();

	    if (ev.key === 'Enter') {
	      ev.preventDefault();
	      input.blur();
	    } else if (ev.key === 'Escape') {
	      ev.preventDefault();
	      // Remove blur listener to prevent it from firing after we remove input
	      input.removeEventListener('blur', finishRename);
	      input.remove();
	      textElement.textContent = originalContent;

	      // Call onComplete to clear isCreating flag
	      if (onComplete) {
	        onComplete();
	      }
	    }
	  });

	  // Also stop propagation for keypress and keyup to prevent interference
	  input.addEventListener('keypress', (ev) => {
	    ev.stopPropagation();
	  });
	  input.addEventListener('keyup', (ev) => {
	    ev.stopPropagation();
	  });
	}

	/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */

	/**
	 * Create a new folder and start renaming it.
	 *
	 * @param {object} deps - Dependencies
	 * @param {typeof import('path')} deps.path - Node path module
	 * @param {(path: string) => boolean} deps.existsSync - fs.existsSync
	 * @param {(path: string) => void} deps.mkdirSync - fs.mkdirSync
	 * @param {(path: string) => string} deps.encodeURIComponentFn
	 *   encodeURIComponent function
	 * @param {() => void} deps.changePath - Function to refresh the view
	 * @param {(deps: object, element: HTMLElement,
	 *   onComplete?: () => void) => void} deps.startRename - startRename fn
	 * @param {string} folderPath - Path where new folder should be created
	 * @returns {void}
	 */
	function createNewFolder (
	  {path, existsSync, mkdirSync, encodeURIComponentFn, changePath, startRename},
	  folderPath
	) {
	  // Prevent double-creation if already in progress
	  if (isCreating) {
	    return;
	  }

	  // Set flag to prevent watcher from interfering
	  setIsCreating(true);

	  // Find an available "untitled folder" name
	  const baseName = 'untitled folder';
	  let newFolderName = baseName;
	  let counter = 2;

	  while (existsSync(path.join(folderPath, newFolderName))) {
	    newFolderName = baseName + counter;
	    counter++;
	  }

	  const newFolderPath = path.join(folderPath, newFolderName);

	  try {
	    // Don't close the watcher - just let it detect the change
	    // The isCreating flag will prevent it from refreshing the view

	    // Create the directory
	    mkdirSync(newFolderPath);

	    // Add to undo stack
	    pushUndo({
	      type: 'create',
	      path: newFolderPath,
	      wasDirectory: true
	    });

	    // Refresh the view to show the new folder
	    // Watcher setup will be skipped due to isCreating flag
	    changePath();

	    // Wait for the view to refresh, then find and start renaming
	    // Use setTimeout instead of nested requestAnimationFrame to avoid freeze
	    setTimeout(() => {
	      // The data-path attribute uses encodeURIComponent for the folder name
	      // Remove trailing slash from folderPath to avoid double slashes
	      const normalizedFolderPath = folderPath.replace(/\/+$/v, '');
	      const encodedPath = normalizedFolderPath + '/' +
	        encodeURIComponentFn(newFolderName);
	      const newFolderElement = $(
	        `[data-path="${CSS.escape(encodedPath)}"]`
	      );
	      if (newFolderElement) {
	        startRename(newFolderElement, () => {
	          // Clear flag after rename completes
	          setIsCreating(false);

	          const currentDir = getBasePath();
	          if (currentDir !== '/') {
	            setupFileWatcher(currentDir);
	          }
	        });

	        // Scroll the folder into view after a delay to avoid freeze
	        setTimeout(() => {
	          const inputElement = newFolderElement.querySelector('input');
	          if (inputElement) {
	            inputElement.scrollIntoView({
	              behavior: 'instant',
	              block: 'center'
	            });

	            // Focus immediately after instant scroll
	            inputElement.focus();
	            inputElement.select();
	          }
	        }, 100);
	      /* c8 ignore next 5 -- Defensive */
	      } else {
	        // eslint-disable-next-line no-console -- Debugging
	        console.warn('Could not find new folder element');
	        setIsCreating(false);
	      }
	    }, 150);
	  } catch (err) {
	    setIsCreating(false);
	    // eslint-disable-next-line no-alert -- User feedback
	    alert('Failed to create folder: ' + (/** @type {Error} */ (err)).message);
	  }
	}

	/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */

	/**
	 * Create and show context menu for folders.
	 *
	 * @param {object} deps - Dependencies
	 * @param {import('jamilih').jml} deps.jml - jamilih jml function
	 * @param {typeof import('jquery')} deps.jQuery - jQuery
	 * @param {typeof import('path')} deps.path - Node path module
	 * @param {object} deps.shell - Electron shell API
	 * @param {(path: string) => boolean} deps.existsSync - fs.existsSync
	 * @param {(path: string, data: string) => void} deps.writeFileSync
	 *   fs.writeFileSync
	 * @param {(path: string) => string} deps.decodeURIComponentFn
	 *   decodeURIComponent fn
	 * @param {(path: string) => string} deps.encodeURIComponentFn
	 *   encodeURIComponent fn
	 * @param {() => void} deps.changePath - Function to refresh the view
	 * @param {(element: HTMLElement,
	 *   onComplete?: () => void) => void} deps.startRename - startRename fn
	 * @param {(itemPath: string) => void} deps.deleteItem
	 *   deleteItem function
	 * @param {Event} e - Context menu event
	 * @returns {void}
	 */
	function showFolderContextMenu (
	  {
	    jml, jQuery, path, shell, existsSync, writeFileSync,
	    decodeURIComponentFn, encodeURIComponentFn,
	    changePath, startRename, deleteItem,
	    getClipboard, setClipboard, copyOrMoveItem
	  },
	  e
	) {
	  e.preventDefault();
	  e.stopPropagation();
	  const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
	  /* c8 ignore next 3 -- TS */
	  if (!pth) {
	    return;
	  }

	  const customContextMenu = jml('ul', {
	    class: 'context-menu',
	    style: {
	      left: /** @type {MouseEvent} */ (e).pageX + 'px',
	      top: /** @type {MouseEvent} */ (e).pageY + 'px'
	    }
	  }, [
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          shell.openPath(pth);
	        }
	      }
	    }, [
	      'Open in Finder'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          setClipboard({path: pth, isCopy: false});
	        }
	      }
	    }, [
	      'Cut'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          setClipboard({path: pth, isCopy: true});
	        }
	      }
	    }, [
	      'Copy'
	    ]],
	    ...(getClipboard() ? [['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          const clip = getClipboard();
	          if (clip) {
	            const targetDir = decodeURIComponentFn(pth);
	            copyOrMoveItem(clip.path, targetDir, clip.isCopy);
	          }
	        }
	      }
	    }, [
	      'Paste'
	    ]]] : []),
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';

	          // Create a temporary new file in the folder
	          const folderPath = decodeURIComponentFn(pth);

	          // Find an available "untitled.txt" name
	          const baseName = 'untitled';
	          const extension = '.txt';
	          let tempFileName = baseName + extension;
	          let counter = 2;

	          while (existsSync(path.join(folderPath, tempFileName))) {
	            tempFileName = baseName + counter + extension;
	            counter++;
	          }

	          const tempFilePath = path.join(folderPath, tempFileName);

	          try {
	            // Create empty file
	            writeFileSync(tempFilePath, '');

	            // Add to undo stack
	            pushUndo({
	              type: 'create',
	              path: tempFilePath,
	              wasDirectory: false
	            });

	            // Refresh the view to show the new file
	            changePath();

	            // Wait for the view to refresh, then find the folder and trigger
	            //   it to load children
	            requestAnimationFrame(() => {
	              requestAnimationFrame(() => {
	                // Find the folder element (anchor tag with this path)
	                const folderElement = $$active('a[data-path]').find(
	                  /** @type {(el: Element) => boolean} */ (
	                    el
	                  ) => /** @type {HTMLElement} */ (el).dataset.path === pth
	                );

	                if (folderElement && folderElement.parentElement) {
	                  // Trigger the folder to be selected so miller-columns
	                  //   builds its children
	                  jQuery(folderElement.parentElement).trigger('click');

	                  // Now wait for children to be built and find our file
	                  const tryFindElement = (attempts = 0) => {
	                    /* c8 ignore next 8 -- Guard */
	                    if (attempts > 20) {
	                      // eslint-disable-next-line no-console -- Debugging
	                      console.log(
	                        'Could not find newly created file ' +
	                        'element after multiple attempts'
	                      );
	                      return;
	                    }

	                    requestAnimationFrame(() => {
	                      // The data-path attribute uses:
	                      //   childDirectory + '/' + encodeURIComponent(title)
	                      // where childDirectory is the decoded path, so we
	                      //   need to decode pth first
	                      const decodedFolderPath = decodeURIComponentFn(pth);
	                      const encodedPath = decodedFolderPath +
	                        '/' + encodeURIComponentFn(tempFileName);

	                      // Minimal logging
	                      // Check both span and a tags (files are span,
	                      //   folders are a)
	                      const allElements = [
	                        ...$$active('span[data-path]'),
	                        ...$$active('a[data-path]')
	                      ];

	                      // Find by matching the data-path attribute directly
	                      const newFileElement = allElements.find(
	                        /** @type {(el: Element) => boolean} */ (
	                          el
	                        ) => /** @type {HTMLElement} */ (
	                          el
	                        ).dataset.path === encodedPath
	                      );

	                      if (newFileElement) {
	                        startRename(/** @type {HTMLElement} */ (
	                          newFileElement
	                        ));
	                      /* c8 ignore next 5 -- Difficult to test: requires
	                          precise timing where DOM updates haven't
	                          completed yet */
	                      } else {
	                        tryFindElement(attempts + 1);
	                      }
	                    });
	                  };
	                  tryFindElement();
	                }
	              });
	            });
	          } catch (err) {
	            // eslint-disable-next-line no-alert -- User feedback
	            alert(
	              'Failed to create file: ' +
	              (/** @type {Error} */ (err)).message
	            );
	          }
	        }
	      }
	    }, [
	      'Create text file'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          // Find the element with this path
	          const targetElement = $(
	            `[data-path="${CSS.escape(pth)}"]`
	          );
	          if (targetElement) {
	            startRename(targetElement);
	          }
	        }
	      }
	    }, [
	      'Rename'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click (ev) {
	          ev.stopPropagation();
	          customContextMenu.style.display = 'none';
	          deleteItem(pth);
	        }
	      }
	    }, [
	      'Delete'
	    ]]
	  ], document.body);

	  // Ensure main context menu is visible within viewport
	  requestAnimationFrame(() => {
	    const menuRect = customContextMenu.getBoundingClientRect();
	    const viewportWidth = window.innerWidth;
	    const viewportHeight = window.innerHeight;

	    // Adjust horizontal position if needed
	    if (menuRect.right > viewportWidth) {
	      customContextMenu.style.left =
	        (viewportWidth - menuRect.width - 10) + 'px';
	    }
	    if (menuRect.left < 0) {
	      customContextMenu.style.left = '10px';
	    }

	    // Adjust vertical position if needed
	    if (menuRect.bottom > viewportHeight) {
	      customContextMenu.style.top =
	        (viewportHeight - menuRect.height - 10) + 'px';
	    }
	    /* c8 ignore next 4 -- Defensive as context menus should
	       be at positive pageX/pageY coordinates */
	    if (menuRect.top < 0) {
	      customContextMenu.style.top = '10px';
	    }
	  });

	  // Hide the custom context menu when clicking anywhere else
	  const hideCustomContextMenu = () => {
	    customContextMenu.style.display = 'none';
	    document.removeEventListener('click', hideCustomContextMenu);
	    document.removeEventListener('contextmenu', hideCustomContextMenu);
	  };
	  document.addEventListener('click', hideCustomContextMenu, {
	    capture: true
	  });
	  document.addEventListener('contextmenu', hideCustomContextMenu, {
	    capture: true
	  });
	}

	/**
	 * Create and show context menu for files.
	 *
	 * @param {object} deps - Dependencies
	 * @param {import('jamilih').jml} deps.jml - jamilih jml function
	 * @param {object} deps.shell - Electron shell API
	 * @param {(path: string, args: string[]) => void} deps.spawnSync
	 *   spawnSync function
	 * @param {(path: string) => Promise<unknown[]>} deps.getOpenWithApps
	 *   getOpenWithApps fn
	 * @param {(apps: unknown[]) => Promise<string[]>} deps.getAppIcons
	 *   getAppIcons function
	 * @param {(element: HTMLElement,
	 *   onComplete?: () => void) => void} deps.startRename - startRename fn
	 * @param {(itemPath: string) => void} deps.deleteItem
	 *   deleteItem function
	 * @param {Event} e - Context menu event
	 * @returns {Promise<void>}
	 */
	async function showFileContextMenu (
	  {
	    jml, shell, spawnSync, getOpenWithApps, getAppIcons,
	    startRename, deleteItem,
	    getClipboard, setClipboard, copyOrMoveItem, path: pathModule
	  },
	  e
	) {
	  e.preventDefault();
	  e.stopPropagation();
	  const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
	  /* c8 ignore next 3 -- TS */
	  if (!pth) {
	    return;
	  }
	  /** @type {import('open-with-me').OpenWithApp & {image?: string}} */
	  let defaultApp = {name: '', path: '', image: ''};
	  const appsOrig = await getOpenWithApps(pth);
	  const icons = await getAppIcons(appsOrig);

	  // Add icons to apps before filtering
	  const appsWithIcons = appsOrig.map((app, idx) => {
	    // @ts-expect-error Add it ourselves
	    app.image = icons[idx];
	    return app;
	  });

	  // Find default app and filter
	  const apps = appsWithIcons.filter((app) => {
	    if (app.isSystemDefault) {
	      defaultApp = app;
	    }
	    return !app.isSystemDefault;
	  }).toSorted((a, b) => {
	    return a.name.localeCompare(b.name);
	  });

	  const customContextMenu = jml('ul', {
	    class: 'context-menu',
	    style: {
	      left: /** @type {MouseEvent} */ (e).pageX + 'px',
	      top: /** @type {MouseEvent} */ (e).pageY + 'px'
	    }
	  }, [
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          shell.openPath(pth);
	        }
	      }
	    }, [
	      'Open'
	    ]],
	    ['li', {
	      class: 'context-menu-item has-submenu'
	    }, [
	      'Open with...',
	      ['ul', {class: 'context-submenu'}, [
	        ['li', {
	          class: 'context-menu-item', dataset: {
	            apppath: defaultApp.path
	          }}, [
	          defaultApp.name + ' (default)'
	        ]],
	        ['li', {class: 'context-menu-separator'}],
	        ...apps.map((app) => {
	          return /** @type {import('jamilih').JamilihArray} */ (['li', {
	            class: 'context-menu-item', dataset: {
	              apppath: app.path
	            }}, [
	            app.name
	          ]]);
	        })
	      ]]
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          setClipboard({path: pth, isCopy: false});
	        }
	      }
	    }, [
	      'Cut'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          setClipboard({path: pth, isCopy: true});
	        }
	      }
	    }, [
	      'Copy'
	    ]],
	    ...(getClipboard() ? [['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          const clip = getClipboard();
	          if (clip) {
	            const targetDir = pathModule.dirname(pth);
	            copyOrMoveItem(clip.path, targetDir, clip.isCopy);
	          }
	        }
	      }
	    }, [
	      'Paste'
	    ]]] : []),
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click () {
	          customContextMenu.style.display = 'none';
	          // Find the element with this path
	          const targetElement = $(
	            `[data-path="${CSS.escape(pth)}"]`
	          );
	          if (targetElement) {
	            startRename(targetElement);
	          }
	        }
	      }
	    }, [
	      'Rename'
	    ]],
	    ['li', {
	      class: 'context-menu-item',
	      $on: {
	        click (ev) {
	          ev.stopPropagation();
	          customContextMenu.style.display = 'none';
	          deleteItem(pth);
	        }
	      }
	    }, [
	      'Delete'
	    ]]
	  ], document.body);

	  // Ensure main context menu is visible within viewport
	  requestAnimationFrame(() => {
	    const menuRect = customContextMenu.getBoundingClientRect();
	    const viewportWidth = window.innerWidth;
	    const viewportHeight = window.innerHeight;

	    // Adjust horizontal position if needed
	    if (menuRect.right > viewportWidth) {
	      customContextMenu.style.left =
	        (viewportWidth - menuRect.width - 10) + 'px';
	    }
	    if (menuRect.left < 0) {
	      customContextMenu.style.left = '10px';
	    }

	    // Adjust vertical position if needed
	    if (menuRect.bottom > viewportHeight) {
	      customContextMenu.style.top =
	        (viewportHeight - menuRect.height - 10) + 'px';
	    }
	    /* c8 ignore next 4 -- Defensive as context menus should
	       be at positive pageX/pageY coordinates */
	    if (menuRect.top < 0) {
	      customContextMenu.style.top = '10px';
	    }
	  });

	  // const targetElement = e.target;

	  // Hide the custom context menu when clicking anywhere else
	  const hideCustomContextMenu = () => {
	    // eslint-disable-next-line @stylistic/max-len -- Long
	    // if (!customContextMenu.contains(/** @type {MouseEvent & {target: Node}} */ (ev).target) &&
	    //   ev.target !== targetElement
	    // ) {
	    customContextMenu.style.display = 'none';
	    document.removeEventListener('click', hideCustomContextMenu);
	    document.removeEventListener('contextmenu', hideCustomContextMenu);
	    // }
	  };
	  document.addEventListener('click', hideCustomContextMenu, {
	    capture: true
	  });
	  document.addEventListener('contextmenu', hideCustomContextMenu, {
	    capture: true
	  });

	  // Add functionality to submenu items
	  const submenu = /** @type {HTMLElement|null} */ (
	    customContextMenu.querySelector('.context-submenu')
	  );
	  if (submenu) {
	    submenu.querySelectorAll('.context-menu-item').forEach((
	      item, idx
	    ) => {
	      /** @type {HTMLElement} */
	      const htmlItem = /** @type {HTMLElement} */ (item);
	      const iconUrl = idx === 0
	        ? defaultApp.image
	        // @ts-expect-error We added it above
	        : apps[idx - 1]?.image;

	      // Only set background if we have a valid icon URL
	      if (iconUrl && iconUrl.trim()) {
	        htmlItem.style.setProperty(
	          '--background',
	          `url("${iconUrl}")`
	        );
	      }

	      item.addEventListener('click', (ev) => {
	        ev.stopPropagation();
	        customContextMenu.style.display = 'none';
	        const {apppath} = /** @type {HTMLElement} */ (item).dataset;
	        /* c8 ignore next 3 -- TS */
	        if (!apppath) {
	          return;
	        }
	        spawnSync('open', [
	          '-a',
	          apppath,
	          pth
	        ]);
	      });
	    });

	    // Ensure submenu is visible horizontally by adjusting its position
	    // Use mouseenter to check when submenu becomes visible
	    const parentLi = submenu.parentElement;
	    if (parentLi) {
	      parentLi.addEventListener('mouseenter', () => {
	        requestAnimationFrame(() => {
	          // Get measurements BEFORE any adjustments
	          const submenuRect = submenu.getBoundingClientRect();
	          const viewportWidth = window.innerWidth;
	          const viewportHeight = window.innerHeight;

	          // Check if submenu actually overflows (is already
	          //   visible but cut off)
	          const actuallyOverflowsRight = submenuRect.right > viewportWidth;
	          const actuallyOverflowsBottom = submenuRect.bottom >
	            viewportHeight;
	          const actuallyOverflowsTop = submenuRect.top < 0;

	          // Handle horizontal overflow - only reposition submenu,
	          //   never main menu
	          if (actuallyOverflowsRight) {
	            const parentRect = parentLi.getBoundingClientRect();
	            const wouldFitOnLeft = parentRect.left - submenuRect.width >= 0;

	            if (wouldFitOnLeft) {
	              // Open to the left instead
	              submenu.style.left = 'auto';
	              submenu.style.right = '100%';
	            } else {
	              // Can't fit on left either, pin to right edge of viewport
	              submenu.style.left = 'auto';
	              submenu.style.right = '10px';
	            }
	          }

	          // Handle vertical overflow - only reposition submenu,
	          //   never main menu
	          /* c8 ignore start - Top overflow unreachable: submenu opens
	             downward at top:0 relative to parent, so rect.top < 0 would
	             require parent to be above viewport (unhoverable) */
	          if (actuallyOverflowsTop) {
	            // Submenu is cut off at the top, position it at viewport top
	            submenu.style.position = 'fixed';
	            submenu.style.top = '10px';
	            submenu.style.bottom = 'auto';
	            // Preserve horizontal position when switching to fixed
	            if (actuallyOverflowsRight && submenu.style.right === '100%') {
	              // Submenu is on the left, keep it there with fixed pos
	              const parentRect = parentLi.getBoundingClientRect();
	              submenu.style.left =
	                (parentRect.left - submenuRect.width) + 'px';
	              submenu.style.right = 'auto';
	            } else if (actuallyOverflowsRight &&
	                       submenu.style.right === '10px') {
	              // Submenu is pinned to right edge, keep it there
	              submenu.style.left = 'auto';
	            } else {
	              submenu.style.left = submenuRect.left + 'px';
	            }
	          } else if (actuallyOverflowsBottom) {
	          /* c8 ignore stop */
	            const parentRect = parentLi.getBoundingClientRect();
	            const wouldFitOnTop = parentRect.top - submenuRect.height >= 0;

	            if (wouldFitOnTop) {
	              // Align to bottom of parent instead
	              submenu.style.top = 'auto';
	              submenu.style.bottom = '0';
	            } else {
	              // Can't fit on top either, pin to bottom edge of viewport
	              submenu.style.position = 'fixed';
	              submenu.style.top = 'auto';
	              submenu.style.bottom = '10px';
	              // Preserve horizontal position when switching to fixed
	              if (actuallyOverflowsRight && submenu.style.right === '100%') {
	                // Submenu is on the left, keep it there with fixed pos
	                submenu.style.left = (parentRect.left - submenuRect.width) +
	                  'px';
	                submenu.style.right = 'auto';
	              } else if (actuallyOverflowsRight &&
	                         submenu.style.right === '10px') {
	                // Submenu is pinned to right edge, keep it there
	                submenu.style.left = 'auto';
	              } else {
	                submenu.style.left = submenuRect.left + 'px';
	              }
	            }
	          }
	        });
	      });
	    }
	  }
	}

	/* eslint-disable n/no-sync -- For performance */

	// Get Node APIs from the preload script
	const {
	  spawnSync: spawnSync$1
	  // @ts-expect-error Ok
	} = globalThis.electronAPI;

	/**
	 * Escape a string for safe use in AppleScript string literals.
	 * @param {string} str - The string to escape
	 * @returns {string} The escaped string
	 */
	function escapeAppleScript (str) {
	  // Escape backslashes first, then quotes
	  return str.replaceAll('\\', '\\\\').
	    replaceAll('"', String.raw`\"`);
	}

	/**
	 * Escape a string for safe use in shell commands.
	 * @param {string} str - The string to escape
	 * @returns {string} The escaped string safe for shell
	 */
	function escapeShell (str) {
	  // Use single quotes and escape any single quotes in the string
	  return `'${str.replaceAll("'", String.raw`'\''`)}'`;
	}

	/**
	 * @param {string} executable
	 * @param {string} scriptPath - Path to the script
	 * @param {string} arg - Argument to pass to the script
	 * @returns {void}
	 */
	function openNewTerminalWithCommand (executable, scriptPath, arg) {
	  // Properly escape both arguments for shell
	  const shellCommand = `${executable} ${
    escapeShell(scriptPath)
  } ${
    escapeShell(arg)
  }`;
	  // Then escape the whole command for AppleScript
	  const escapedCommand = escapeAppleScript(shellCommand);
	  const appleScript = `
    tell application "Terminal"
        do script "${escapedCommand}"
        activate
    end tell
  `;

	  spawnSync$1('osascript', ['-e', appleScript], {
	    stdio: 'inherit'
	  });
	}

	/* eslint-disable promise/prefer-await-to-then,
	  n/no-sync,
	  promise/catch-or-return -- Needed for performance */

	// Get Node APIs from the preload script
	const {
	  fs: {
	    mkdirSync, writeFileSync, existsSync, renameSync, lstatSync
	  },
	  path,
	  // eslint-disable-next-line no-shadow -- Different process
	  process,
	  spawnSync,
	  shell,
	  getOpenWithApps,
	  getAppIcons,
	  getIconDataURLForFile,
	  getFileKind,
	  getFileMetadata
	} = globalThis.electronAPI;

	// Ensure jamilih uses the browser's DOM instead of jsdom
	jmlExports.jml.setWindow(globalThis);

	// Set up event bus listeners for decoupled module communication
	on('pushUndo', (action) => {
	  pushUndo(action);
	});
	on('refreshView', () => {
	  changePath();
	});

	// Track if a drag is in progress and the dragged element
	let isDragging = false;
	let currentDraggedElement = null;
	let escapeUsedForDragCancel = false;
	let mouseIsDown = false;
	let hoverOpenTimer = null;
	let currentHoverTarget = null;

	// Track mouse button state globally
	document.addEventListener('mousedown', () => {
	  mouseIsDown = true;
	}, true);

	document.addEventListener('mouseup', () => {
	  mouseIsDown = false;
	  // Reset escape flag when mouse is released
	  escapeUsedForDragCancel = false;
	}, true);

	// Set up escape key handler EARLY to ensure it runs before miller-columns
	document.addEventListener('keydown', (e) => {
	  if (e.key === 'Escape' && isDragging) {
	    e.preventDefault();
	    e.stopPropagation();
	    e.stopImmediatePropagation();
	    escapeUsedForDragCancel = true;
	    // Setting dropEffect to 'none' cancels the drag
	    if (currentDraggedElement) {
	      // Trigger dragend by removing draggable temporarily
	      currentDraggedElement.setAttribute('draggable', 'false');
	      setTimeout(() => {
	        if (currentDraggedElement) {
	          currentDraggedElement.setAttribute('draggable', 'true');
	        }
	      }, 0);
	    }
	    isDragging = false;
	    currentDraggedElement = null;
	    // Clean up any drag-over highlights
	    document.querySelectorAll('.drag-over').forEach((elem) => {
	      elem.classList.remove('drag-over');
	    });
	    return;
	  }

	  // Block Escape if used for drag cancel OR if mouse is still down
	  if (e.key === 'Escape' && (escapeUsedForDragCancel || mouseIsDown)) {
	    e.preventDefault();
	    e.stopPropagation();
	    e.stopImmediatePropagation();
	  }
	}, true); // Use capture phase to run before other handlers

	// Reset escape flag when key released (but keep blocking if mouse down)
	document.addEventListener('keyup', (e) => {
	  if (e.key === 'Escape' && !mouseIsDown) {
	    escapeUsedForDragCancel = false;
	  }
	}, true);

	/**
	 * Add drag-and-drop support to an element.
	 * @param {HTMLElement} element - The element to make draggable
	 * @param {string} itemPath - The path of the item
	 * @param {boolean} isFolder - Whether the item is a folder
	 * @returns {void}
	 */
	function addDragAndDropSupport (element, itemPath, isFolder) {
	  // Prevent duplicate listener registration
	  if (element.dataset.dragEnabled) {
	    return;
	  }
	  element.dataset.dragEnabled = 'true';

	  // Make the entire list item draggable (so icon area is draggable too)
	  element.setAttribute('draggable', 'true');

	  element.addEventListener('dragstart', (e) => {
	    isDragging = true;
	    currentDraggedElement = element;
	    if (e.dataTransfer) {
	      e.dataTransfer.effectAllowed = 'copyMove';
	      e.dataTransfer.setData('text/plain', itemPath);
	    }
	  });

	  element.addEventListener('dragend', () => {
	    isDragging = false;
	    currentDraggedElement = null;
	    // Clean up any lingering drag-over classes
	    document.querySelectorAll('.drag-over').forEach((el) => {
	      el.classList.remove('drag-over');
	    });
	    // Clear hover-to-open timer
	    if (hoverOpenTimer) {
	      clearTimeout(hoverOpenTimer);
	      hoverOpenTimer = null;
	    }
	    currentHoverTarget = null;
	  });

	  // Determine if this is an executable file (bash or JavaScript)
	  const decodedPath = decodeURIComponent(itemPath);
	  const ext = path.extname(decodedPath).toLowerCase();
	  const isExecutableFile = !isFolder &&
	    (ext === '.sh' || ext === '.js' || ext === '.cjs' || ext === '.mjs');

	  // Allow drop on folders or executable files
	  if (isFolder || isExecutableFile) {
	    const dropTarget = element;
	    dropTarget.addEventListener('dragover', (e) => {
	      e.preventDefault();
	      dropTarget.classList.add('drag-over');
	      /* c8 ignore next 3 -- dataTransfer always present in modern browsers */
	      if (e.dataTransfer) {
	        // For executable files, show copy effect to indicate execution
	        e.dataTransfer.dropEffect = isExecutableFile
	          ? 'copy'
	          : (e.altKey ? 'copy' : 'move');
	      }

	      // Set up hover-to-open timer only for folders
	      if (isFolder && currentHoverTarget !== dropTarget) {
	        // Clear any existing timer
	        if (hoverOpenTimer) {
	          clearTimeout(hoverOpenTimer);
	        }

	        currentHoverTarget = dropTarget;

	        // Set timer to open folder after 1 second of hovering
	        hoverOpenTimer = setTimeout(() => {
	          // Navigate into the folder
	          const navPath = decodeURIComponent(itemPath);
	          globalThis.location.hash = `#path=${encodeURIComponent(
            navPath
          )}`;
	        }, 1000);
	      }
	    });

	    dropTarget.addEventListener('dragleave', (e) => {
	      // Only remove if actually leaving the element (not entering a child)
	      const rect = dropTarget.getBoundingClientRect();
	      const x = e.clientX;
	      const y = e.clientY;
	      if (x < rect.left || x >= rect.right ||
	          y < rect.top || y >= rect.bottom) {
	        dropTarget.classList.remove('drag-over');

	        // Clear hover-to-open timer when leaving
	        if (currentHoverTarget === dropTarget) {
	          if (hoverOpenTimer) {
	            clearTimeout(hoverOpenTimer);
	            hoverOpenTimer = null;
	          }
	          currentHoverTarget = null;
	        }
	      }
	    });

	    dropTarget.addEventListener('drop', (e) => {
	      e.preventDefault();
	      e.stopPropagation(); // Prevent bubbling to parent drop handlers
	      dropTarget.classList.remove('drag-over');

	      // Clear hover-to-open timer on drop
	      if (hoverOpenTimer) {
	        clearTimeout(hoverOpenTimer);
	        hoverOpenTimer = null;
	      }
	      currentHoverTarget = null;

	      const sourcePath = e.dataTransfer?.getData('text/plain');

	      if (isExecutableFile && sourcePath) {
	        // Execute the file with the dropped file/folder as argument
	        const targetScriptPath = decodeURIComponent(itemPath);
	        const sourcePathDecoded = decodeURIComponent(sourcePath);

	        try {
	          if (ext === '.sh') {
	            // Execute bash script
	            /* c8 ignore next 3 -- Hard to test interactive execution */
	            openNewTerminalWithCommand(
	              'bash', targetScriptPath, sourcePathDecoded
	            );
	          } else {
	            // Execute JavaScript file with node
	            /* c8 ignore next 3 -- Hard to test interactive execution */
	            openNewTerminalWithCommand(
	              'node', targetScriptPath, sourcePathDecoded
	            );
	          }
	        } catch (err) {
	          // eslint-disable-next-line no-console -- User feedback
	          console.error('Failed to execute script:', err);
	          // eslint-disable-next-line no-alert -- User feedback
	          alert(`Failed to execute script: ${
            (/** @type {Error} */ (err)).message
          }`);
	        }
	      } else if (isFolder) {
	        // Folder drop: copy or move
	        const targetPath = itemPath;
	        if (sourcePath && targetPath && !getIsCopyingOrMoving()) {
	          copyOrMoveItem(sourcePath, targetPath, e.altKey);
	        }
	      }
	    });
	  }
	}

	/**
	 * Update breadcrumbs for navigation.
	 * @param {string} currentPath - The current path to display
	 * @returns {void}
	 */
	function updateBreadcrumbs (currentPath) {
	  const breadcrumbsDiv = $('.miller-breadcrumbs');
	  if (!breadcrumbsDiv) {
	    return;
	  }

	  // Clear existing breadcrumbs
	  breadcrumbsDiv.innerHTML = '';

	  // Split path into segments
	  const segments = currentPath === '/'
	    ? []
	    : currentPath.split('/').filter(Boolean);

	  // Create root breadcrumb
	  jmlExports.jml('span', {
	    class: 'miller-breadcrumb miller-breadcrumb-root',
	    $on: {
	      click () {
	        globalThis.location.hash = '#path=/';
	      }
	    }
	  }, ['/'], breadcrumbsDiv);

	  // Create breadcrumb for each segment
	  let accumulatedPath = '';
	  segments.forEach((segment) => {
	    accumulatedPath += '/' + segment;
	    const segmentPath = accumulatedPath;
	    jmlExports.jml('span', {
	      class: 'miller-breadcrumb',
	      $on: {
	        click () {
	          globalThis.location.hash =
	            `#path=${encodeURIComponent(segmentPath)}`;
	        }
	      }
	    }, [decodeURIComponent(segment)], breadcrumbsDiv);
	  });
	}


	/**
	 *
	 * @returns {void}
	 */
	function changePath () {
	  const view = getCurrentView();

	  const currentBasePath = getBasePath();
	  const basePath = view === 'icon-view' ? currentBasePath : '/';

	  // Save scroll positions of selected items before refresh
	  const scrollPositions = new Map();
	  if (view === 'three-columns') {
	    const selectedItems = $$('.miller-columns li.miller-selected');
	    selectedItems.forEach((item) => {
	      const link = item.querySelector('a[data-path], span[data-path]');
	      if (link) {
	        const dataPath = link.dataset.path;
	        const column = item.closest('ul.miller-column');
	        if (column && dataPath) {
	          // Get the column index to identify it after refresh
	          const allColumns = $$('.miller-column');
	          const columnIndex = [...allColumns].indexOf(column);

	          // Calculate position within the scrollable area
	          // offsetTop is relative to the column's content
	          // scrollTop is how much we've scrolled
	          // The item's position in the viewport is: offsetTop - scrollTop
	          const viewportPosition = item.offsetTop - column.scrollTop;

	          scrollPositions.set(dataPath, {
	            columnIndex,
	            viewportPosition,
	            columnScrollTop: column.scrollTop
	          });
	        }
	      }
	    });
	  }

	  const localSaved = localStorage.getItem(`stickyNotes-local-${basePath}`);
	  stickyNotes.clear(({metadata}) => {
	    return metadata.type === 'local';
	  });
	  if (localSaved) {
	    stickyNotes.loadNotes(JSON.parse(localSaved));
	    stickyNotes.notes.forEach((note) => {
	      if (note.metadata.type === 'local') {
	        addLocalStickyInputListeners(note, basePath);
	      }
	    });
	  }

	  const result = readDirectory(basePath);
	  addItems(result, basePath, currentBasePath);

	  // Restore scroll positions after refresh
	  if (view === 'three-columns' && scrollPositions.size > 0) {
	    // Use triple requestAnimationFrame to run after the path navigation
	    // scrollIntoView calls (which use double requestAnimationFrame)
	    requestAnimationFrame(() => {
	      requestAnimationFrame(() => {
	        requestAnimationFrame(() => {
	          const allLinks = $$('a[data-path], span[data-path]');

	          scrollPositions.forEach((savedPosition, dataPath) => {
	            // Find by direct comparison since CSS.escape breaks on paths
	            const link = allLinks.find((l) => l.dataset.path === dataPath);

	            if (link) {
	              const item = link.closest('li');
	              const column = link.closest('ul.miller-column');

	              // Verify we're in the same column by index
	              const allColumns = $$('.miller-column');
	              const columnIndex = [...allColumns].indexOf(column);

	              if (item && column &&
	                  columnIndex === savedPosition.columnIndex) {
	                // To maintain the same viewport position:
	                // We want: newOffsetTop - newScrollTop = viewportPosition
	                // So: newScrollTop = newOffsetTop - viewportPosition
	                const targetScrollTop =
	                  item.offsetTop - savedPosition.viewportPosition;

	                // Clamp to valid scroll range
	                // (can't scroll negative or beyond content)
	                const maxScroll = column.scrollHeight - column.clientHeight;
	                const newScrollTop =
	                  Math.max(0, Math.min(targetScrollTop, maxScroll));

	                // Adjust scroll to maintain the same visual position
	                column.scrollTop = newScrollTop;
	              }
	            }
	          });
	        });
	      });
	    });
	  }

	  // Setup watcher for the current directory being viewed
	  // (not basePath which could be / in list view)
	  // During folder creation, skip entirely - the watcher stays alive
	  // and will detect changes after isCreating becomes false
	  if (isCreating) {
	    return;
	  }

	  setupFileWatcher(currentBasePath);

	  // In three-columns view, also set up watchers for all ancestor directories
	  // to detect sibling changes
	  if (view === 'three-columns') {
	    let ancestorPath = path.dirname(currentBasePath);
	    while (ancestorPath && ancestorPath !== '/' && ancestorPath !== '.') {
	      setupFileWatcher(ancestorPath);
	      const nextAncestor = path.dirname(ancestorPath);
	      /* c8 ignore next 4 - Defensive break, unreachable because
	         while condition exits when ancestorPath === '/' */
	      if (nextAncestor === ancestorPath) {
	        break;
	      }
	      ancestorPath = nextAncestor;
	    }
	  }
	}

	/**
	 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
	 */

	// Create wrapper functions that pass changePath
	const performUndo = () => performUndo$1(changePath);
	const performRedo = () => performRedo$1(changePath);

	// Use imported references from watcher module
	const foldersWithPendingChanges = foldersWithPendingChanges$1;

	/**
	 *
	 * @param {Result[]} result
	 * @param {string} basePath
	 * @param {string} currentBasePath
	 * @returns {void}
	 */
	function addItems (result, basePath, currentBasePath) {
	  const view = getCurrentView();

	  $('i').hidden = true;
	  const ul = $('ul');
	  while (ul.firstChild) {
	    ul.firstChild.remove();
	  }

	  /**
	   * @param {string} itemPath
	   */
	  const deleteItem$1 = (itemPath) => {
	    deleteItem(itemPath);
	  };

	  /**
	   * @param {string} sourcePath
	   * @param {string} targetDir
	   * @param {boolean} isCopy
	   */
	  const copyOrMoveItem$1 = (sourcePath, targetDir, isCopy) => {
	    copyOrMoveItem(sourcePath, targetDir, isCopy);
	  };

	  /**
	   * @param {string} folderPath
	   */
	  const createNewFolder$1 = (folderPath) => {
	    createNewFolder(
	      {
	        path,
	        existsSync,
	        mkdirSync,
	        encodeURIComponentFn: encodeURIComponent,
	        changePath,
	        startRename: startRename$1
	      },
	      folderPath
	    );
	  };

	  /**
	   * @param {HTMLElement} [textElement]
	   * @param {(() => void)} [onComplete] - Callback when rename completes
	   */
	  const startRename$1 = (textElement, onComplete) => {
	    startRename(
	      {
	        path,
	        jQuery,
	        renameSync,
	        decodeURIComponentFn: decodeURIComponent,
	        changePath
	      },
	      textElement,
	      onComplete
	    );
	  };

	  // Expose for testing
	  /* c8 ignore next 4 -- Test helper */
	  if (typeof globalThis !== 'undefined') {
	    /** @type {unknown} */ (globalThis).startRenameForTesting = startRename$1;
	    /** @type {unknown} */ (globalThis).createNewFolderForTesting =
	      createNewFolder$1;
	  }

	  /**
	   * @param {Event} e
	   */
	  const folderContextmenu = (e) => {
	    showFolderContextMenu(
	      {
	        jml: jmlExports.jml,
	        jQuery,
	        path,
	        shell,
	        existsSync,
	        writeFileSync,
	        decodeURIComponentFn: decodeURIComponent,
	        encodeURIComponentFn: encodeURIComponent,
	        changePath,
	        startRename: startRename$1,
	        deleteItem: deleteItem$1,
	        getClipboard,
	        setClipboard,
	        copyOrMoveItem: copyOrMoveItem$1
	      },
	      e
	    );
	  };

	  /**
	   * @param {Event} e
	   */
	  const contextmenu = async (e) => {
	    await showFileContextMenu(
	      {
	        jml: jmlExports.jml,
	        shell,
	        spawnSync,
	        getOpenWithApps,
	        getAppIcons,
	        startRename: startRename$1,
	        deleteItem: deleteItem$1,
	        getClipboard,
	        setClipboard,
	        copyOrMoveItem: copyOrMoveItem$1,
	        path
	      },
	      e
	    );
	  };

	  const listItems = result.map(([
	    isDir,
	    // eslint-disable-next-line no-unused-vars -- Not in use
	    _childDir,
	    title
	  ]) => {
	    const li = jmlExports.jml(
	      view === 'icon-view' ? 'td' : 'li',
	      {
	        class: 'list-item'
	        // style: url ? 'list-style-image: url("' + url + '")' : undefined
	      }, [
	        isDir
	          ? ['a', {
	            title: basePath + encodeURIComponent(title),
	            $on: {
	              contextmenu: folderContextmenu
	            },
	            dataset: {
	              path: basePath + encodeURIComponent(title)
	            },
	            ...(view === 'icon-view'
	              ? {
	                href: '#path=' + basePath + encodeURIComponent(title)
	              }
	              : {})
	          }, [
	            title
	          ]]
	          : ['span', {
	            title: basePath + encodeURIComponent(title),
	            $on: {
	              contextmenu
	            },
	            dataset: {
	              path: basePath + encodeURIComponent(title)
	            }
	          }, [title]]
	      ]
	    );

	    getIconDataURLForFile(
	      path.join(basePath, title)
	    ).then((url) => {
	      const width = '25px';
	      const paddingTopBottom = '5px';
	      const paddingRightLeft = '30px';
	      const marginTopBottom = '18px';
	      li.setAttribute(
	        'style',
	        url
	          ? `margin-top: ${
            marginTopBottom
          }; margin-bottom: ${
            marginTopBottom
          }; padding: ${paddingTopBottom} ${
            paddingRightLeft
          } ${paddingTopBottom} ${
            paddingRightLeft
          }; background-image: url(${
            url
          }); background-size: ${width};`
	          /* c8 ignore next -- url should be present */
	          : ''
	      );
	      return undefined;
	    });

	    return li;
	  });

	  const numIconColumns = 4;

	  jmlExports.jml(ul, [
	    (view === 'icon-view' && basePath !== '/'
	      ? [
	        'li', [
	          ['a', {
	            class: 'go-up-path',
	            title: path.normalize(path.join(basePath, '..')),
	            href: '#path=' + path.normalize(path.join(basePath, '..'))
	          }, [
	            '..'
	          ]]
	        ]
	      ]
	      : ''),
	    ...(view === 'icon-view'
	      ? /** @type {import('jamilih').JamilihArray[]} */ ([[
	        'table', {dataset: {basePath}},
	        chunk(listItems, numIconColumns).map((innerArr) => {
	          return ['tr', innerArr];
	        })
	      ]])
	      : listItems)
	  ]);

	  if ($columns?.destroy) {
	    $columns.destroy();
	    if (view === 'icon-view') {
	      changePath();
	    }
	  }

	  if (view === 'icon-view') {
	    // Update breadcrumbs for icon view
	    updateBreadcrumbs(currentBasePath);

	    // Add keyboard support for icon-view
	    const iconViewTable = $('table[data-base-path]');
	    if (iconViewTable) {
	      // Make table focusable
	      iconViewTable.setAttribute('tabindex', '0');

	      // Remove any existing keydown listeners to avoid duplicates
	      const oldListener = iconViewTable._keydownListener;
	      if (oldListener) {
	        iconViewTable.removeEventListener('keydown', oldListener);
	      }

	      // Add drag-and-drop support to all cells
	      const cells = iconViewTable.querySelectorAll('td.list-item');
	      cells.forEach((cell) => {
	        const cellEl = /** @type {HTMLElement} */ (cell);
	        const link = cellEl.querySelector('a, span');
	        if (link) {
	          const linkEl = /** @type {HTMLElement} */ (link);
	          const itemPath = linkEl.dataset.path;
	          if (itemPath) {
	            const isFolder = linkEl.tagName === 'A';
	            addDragAndDropSupport(cellEl, itemPath, isFolder);
	          }
	        }
	      });

	      // Add new keydown listener
	      const keydownListener = (e) => {
	        // Cmd+Shift+N to create new folder
	        if (e.metaKey && e.shiftKey && e.key === 'n') {
	          e.preventDefault();
	          /* c8 ignore next -- TS */
	          const folderPath = iconViewTable.dataset.basePath || '/';
	          createNewFolder$1(folderPath);

	        // Cmd+C to copy selected item
	        } else if (e.metaKey && e.key === 'c') {
	          const selectedRow = iconViewTable.querySelector('tr.selected');
	          if (selectedRow) {
	            e.preventDefault();
	            const selectedEl = /** @type {HTMLElement} */ (selectedRow);
	            const itemPath = selectedEl.dataset.path;
	            if (itemPath) {
	              setClipboard({path: itemPath, isCopy: true});
	            }
	          }

	        // Cmd+X to cut selected item
	        } else if (e.metaKey && e.key === 'x') {
	          const selectedRow = iconViewTable.querySelector('tr.selected');
	          if (selectedRow) {
	            e.preventDefault();
	            const selectedEl = /** @type {HTMLElement} */ (selectedRow);
	            const itemPath = selectedEl.dataset.path;
	            if (itemPath) {
	              setClipboard({path: itemPath, isCopy: false});
	            }
	          }

	        // Cmd+V to paste (copy) to current directory
	        } else if (e.metaKey && e.key === 'v' && getClipboard()) {
	          e.preventDefault();
	          /* c8 ignore next -- TS */
	          const targetDir = iconViewTable.dataset.basePath || '/';
	          const clip = getClipboard();
	          copyOrMoveItem$1(clip.path, targetDir, clip.isCopy);
	          setClipboard(null);
	        }
	      };

	      iconViewTable.addEventListener('keydown', keydownListener);
	      // Store reference for cleanup
	      // @ts-expect-error Custom property
	      iconViewTable._keydownListener = keydownListener;

	      // Add drop support for table background (empty space)
	      iconViewTable.addEventListener('dragover', (e) => {
	        // Only handle drops on the table itself or empty cells, not on items
	        const {target} = e;
	        const targetEl = /** @type {HTMLElement} */ (target);
	        if (targetEl === iconViewTable || targetEl.tagName === 'TR' ||
	            (targetEl.tagName === 'TD' &&
	             !targetEl.classList.contains('list-item'))) {
	          e.preventDefault();
	          if (e.dataTransfer) {
	            e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
	          }
	        }
	      });

	      iconViewTable.addEventListener('drop', (e) => {
	        const {target} = e;
	        const targetEl = /** @type {HTMLElement} */ (target);
	        // Only handle drops on the table itself or empty cells, not on items
	        if (targetEl === iconViewTable || targetEl.tagName === 'TR' ||
	            (targetEl.tagName === 'TD' &&
	             !targetEl.classList.contains('list-item'))) {
	          e.preventDefault();
	          e.stopPropagation();
	          const sourcePath = e.dataTransfer?.getData('text/plain');
	          /* c8 ignore next -- TS */
	          const targetDir = iconViewTable.dataset.basePath || '/';
	          if (sourcePath && targetDir && !getIsCopyingOrMoving()) {
	            copyOrMoveItem$1(sourcePath, targetDir, e.altKey);
	          }
	        }
	      });

	      // Focus the table for keyboard navigation
	      requestAnimationFrame(() => {
	        iconViewTable.focus();
	      });
	    }
	    return;
	  }

	  const millerColumns = jQuery('div.miller-columns');
	  const parentMap = new WeakMap();
	  const childMap = new WeakMap();
	  const columnsInstance = millerColumns.millerColumns({
	    // Options:
	    breadcrumbRoot: '/',
	    preview ($item) {
	      const elem = $item.find('[data-path]')[0];
	      const pth = decodeURIComponent(elem.dataset.path);
	      const lstat = lstatSync(pth);
	      const kind = getFileKind(pth);
	      const metadata = getFileMetadata(pth);
	      const category = getMacAppCategory(pth);

	      // Also has `metadata.ItemDateAdded` (date added) but doesn't
	      //   show on preview
	      // Also has `metadata.ItemFinderComment` (comment) but doesn't
	      //   show on preview

	      console.log('metadata2', metadata, category);
	      /**
	       * @param {number} timestamp
	       * @returns {string}
	       */
	      function getFormattedDate (timestamp) {
	        return new Date(timestamp).toLocaleString('en-US', {
	          weekday: 'long',
	          year: 'numeric',
	          month: 'long',
	          day: 'numeric',
	          hour: 'numeric',
	          minute: 'numeric',
	          hour12: true
	        });
	      }
	      return `<div><b>${elem.textContent}</b></div>
<div>${kind} - ${filesize(lstat.size)}</div>
<div><b>Information</b></div>
<table>
  <tr><td>Created</td><td>${getFormattedDate(lstat.birthtimeMs)}</td></tr>
  <tr><td>Modified</td><td>${getFormattedDate(lstat.mtimeMs)}</td></tr>
  <tr><td>Last opened</td><td>${
    getFormattedDate(metadata.ItemLastUsedDate)
  }</td></tr>${
    metadata.ItemVersion
      ? `<tr><td>Version</td><td>${metadata.ItemVersion}</td></tr>`
      : ''
  }${
    category
      ? `<tr><td>Category</td><td>${category}</td></tr>`
      : ''
  }</table>
<div><b>Tags</b></div>
`;
	    },
	    animation () {
	      // No-op to avoid need for timeouts and jarring redraws
	    },
	    reset () {
	      // Update URL to root when escape key resets to root
	      const rootPath = '/';
	      history.replaceState(
	        null,
	        '',
	        location.pathname + '#path=' + encodeURIComponent(rootPath)
	      );

	      // Load sticky notes for root path
	      const saved = localStorage.getItem(`stickyNotes-local-${rootPath}`);
	      stickyNotes.clear(({metadata}) => {
	        return metadata.type === 'local';
	      });
	      if (saved) {
	        stickyNotes.loadNotes(JSON.parse(saved));
	        stickyNotes.notes.forEach((note) => {
	          if (note.metadata.type === 'local') {
	            addLocalStickyInputListeners(note, rootPath);
	          }
	        });
	      }
	    },
	    // @ts-ignore Sometime bugginess
	    current ($item /* , $cols */) {
	      /**
	       * @param {string} pth
	       */
	      const updateHistoryAndStickies = (pth) => {
	        history.replaceState(
	          null,
	          '',
	          location.pathname + '#path=' + encodeURIComponent(
	            pth
	          )
	        );
	        const saved = localStorage.getItem(`stickyNotes-local-${pth}`);
	        stickyNotes.clear(({metadata}) => {
	          return metadata.type === 'local';
	        });
	        if (saved) {
	          stickyNotes.loadNotes(JSON.parse(saved));
	          stickyNotes.notes.forEach((note) => {
	            if (note.metadata.type === 'local') {
	              addLocalStickyInputListeners(note, pth);
	            }
	          });
	        }
	      };
	      // Minimal logging: diagnostics removed
	      let needsRefresh = false;

	      if (parentMap.has($item[0])) {
	        const itemPath = parentMap.get($item[0]);

	        // Check if this folder has pending changes
	        const hasPendingChanges =
	          itemPath && foldersWithPendingChanges.has(itemPath);

	        if (hasPendingChanges) {
	          // Pending changes detected; rebuild next

	          // Clear the pending changes flag
	          foldersWithPendingChanges.delete(itemPath);

	          // Mark that we need to do a full refresh rebuild
	          needsRefresh = true;

	          // Clear plugin data from this item
	          // (DOM cleanup will happen before addItem)
	          const anchorEl = $item.children('a[title]')[0];
	          if (anchorEl) {
	            jQuery(anchorEl).removeData('miller-columns-child');
	          }
	          $item.removeData('miller-columns-ancestor');
	          $item.removeClass('miller-columns-parent');

	          // Clear caches for this specific item
	          parentMap.delete($item[0]);
	          childMap.delete($item[0]);

	          // Fall through to force reload
	        } else {
	          // No pending changes - use normal cached behavior
	          updateHistoryAndStickies(itemPath);

	          const childElement = childMap.get($item[0]);
	          if (childElement) {
	            // Scroll the child item's parent column into view
	            const column = childElement.closest('.miller-column');
	            if (column) {
	              // Skip scrollIntoView during rename to preserve scroll
	              if (!isCreating) {
	                requestAnimationFrame(() => {
	                  requestAnimationFrame(() => {
	                    column.scrollIntoView({
	                      block: 'nearest',
	                      inline: 'start'
	                    });
	                  });
	                });
	              }
	            }
	          }
	          return;
	        }
	      }

	      // If we reach here, either:
	      // 1. Item wasn't in parentMap (fresh load)
	      // 2. Item had pending changes (need to reload)

	      const a = $item.children('a[title]');
	      if (!a.length) {
	        return;
	      }

	      const parent = $item.parent();
	      const prev = parent.prevAll(
	        'ul.miller-column:not(.miller-collapse)'
	      ).first();
	      const parentLi = prev.children('li.miller-selected')[0];

	      const parentText = parentMap.get(parentLi) ?? '';
	      const currentPath = parentText + '/' + a.text();

	      // Minimal logging

	      updateHistoryAndStickies(currentPath);

	      // Check if this folder has pending changes and remove from tracking
	      const hasPendingChanges2 =
	        foldersWithPendingChanges.has(currentPath);
	      /* c8 ignore next 3 -- Just cleanup */
	      if (hasPendingChanges2) {
	        foldersWithPendingChanges.delete(currentPath);
	      }

	      const childResult = readDirectory(currentPath);
	      // Minimal logging

	      const childItems = childResult.map(([
	        isDir, childDirectory, title
	      ]) => {
	        const width = '25px';
	        const paddingRightLeft = '30px';
	        const marginTopBottom = '18px';
	        const li = jmlExports.jml('li', {class: 'list-item'}, [
	          isDir
	            ? ['a', {
	              title: childDirectory + '/' +
	                encodeURIComponent(title),
	              $on: {
	                contextmenu: folderContextmenu
	              },
	              dataset: {
	                path: childDirectory + '/' +
	                  encodeURIComponent(title)
	              }
	              // href: '#path=' + childDirectory + '/' +
	              //  encodeURIComponent(title)
	            }, [
	              title
	            ]]
	            : ['span', {
	              $on: {
	                contextmenu
	              },
	              title: childDirectory + '/' +
	                encodeURIComponent(title),
	              dataset: {
	                path: childDirectory + '/' +
	                  encodeURIComponent(title)
	              }
	            }, [title]]
	        ]);

	        // Add drag-and-drop support immediately after creating the item
	        const itemPath = childDirectory + '/' + encodeURIComponent(title);
	        addDragAndDropSupport(li, itemPath, isDir);

	        getIconDataURLForFile(
	          path.join(childDirectory, title)
	        ).then((url) => {
	          li.setAttribute(
	            'style',
	            url
	              ? `margin-top: ${
                marginTopBottom
              }; margin-bottom: ${
                marginTopBottom
              }; padding: 0 ${
                paddingRightLeft
              } 0 ${
                paddingRightLeft
              }; list-style: none; background-image: url(${
                url
              }); background-repeat: no-repeat; ` +
	              `background-position: left center; background-size: ${width};`
	              /* c8 ignore next -- Should be found */
	              : ''
	          );
	          return undefined;
	        });

	        return li;
	      });

	      // Build children - use refreshChildren for refresh, addItem for fresh
	      if (needsRefresh && $columns.refreshChildren &&
	          typeof $columns.refreshChildren === 'function') {
	        // For refresh: use refreshChildren to replace children properly
	        $columns.refreshChildren(
	          $item,
	          childItems.map((item) => jQuery(item))
	        );

	        if (childItems.length > 0) {
	          childMap.set($item[0], childItems[0]);
	          // Skip scrollIntoView during rename to preserve scroll restoration
	          if (!isCreating) {
	            requestAnimationFrame(() => {
	              requestAnimationFrame(() => {
	                childItems[0].scrollIntoView({
	                  block: 'start', inline: 'start'
	                });
	              });
	            });
	          }
	        }
	      } else if ($columns.addItem && typeof $columns.addItem === 'function') {
	        // Normal addItem path for first-time navigation
	        const addItemFn = $columns.addItem;

	        childItems.forEach((childItem, idx) => {
	          const item = addItemFn.call($columns, jQuery(childItem), $item);

	          if (idx === 0) {
	            childMap.set($item[0], item[0]);
	            // Skip scrollIntoView during rename to preserve scroll restoration
	            if (!isCreating) {
	              requestAnimationFrame(() => {
	                requestAnimationFrame(() => {
	                  item[0].scrollIntoView({
	                    block: 'start', inline: 'start'
	                  });
	                });
	              });
	            }
	          }
	        });
	      }

	      // CRITICAL: Update parentMap after building children
	      // This ensures subsequent navigation will hit the cache path
	      parentMap.set($item[0], currentPath);

	      // Set up watcher for this expanded folder in miller columns view
	      const currentView = getCurrentView();
	      if (currentView === 'three-columns') {
	        setupFileWatcher(currentPath);

	        // Also set up watchers for all ancestor directories to detect
	        // sibling changes
	        let ancestorPath = path.dirname(currentPath);
	        while (ancestorPath && ancestorPath !== '/' && ancestorPath !== '.') {
	          setupFileWatcher(ancestorPath);
	          const nextAncestor = path.dirname(ancestorPath);
	          /* c8 ignore next 3 -- Defensive */
	          if (nextAncestor === ancestorPath) {
	            break;
	          }
	          ancestorPath = nextAncestor;
	        }
	      }
	    }
	  });

	  set$columns(columnsInstance);

	  $columns.on('dblclick', (e) => {
	    if (e.target.dataset.path) {
	      shell.openPath(e.target.dataset.path);
	    }
	  });
	  $columns.on('keydown', (e) => {
	    const selectedLi = $columns.find('li.miller-selected').last();
	    const pth = selectedLi.find('span, a')[0]?.dataset?.path;

	    if (e.metaKey && e.key === 'o' && pth) {
	      shell.openPath(pth);
	    // Cmd+Delete to delete selected item
	    } else if (e.metaKey && e.key === 'Backspace' && pth) {
	      e.preventDefault();
	      deleteItem$1(pth);
	    // Cmd+C to copy selected item
	    } else if (e.metaKey && e.key === 'c' && pth) {
	      e.preventDefault();
	      setClipboard({path: pth, isCopy: true});
	    // Cmd+X to cut selected item
	    } else if (e.metaKey && e.key === 'x' && pth) {
	      e.preventDefault();
	      setClipboard({path: pth, isCopy: false});
	    // Cmd+V to paste into selected folder
	    } else if (e.metaKey && e.key === 'v' && getClipboard()) {
	      e.preventDefault();
	      // Paste into the selected folder, or current base path if file selected
	      /* c8 ignore next 3 -- Difficult to cover */
	      const targetPath = pth && selectedLi.find('a[data-path]').length
	        ? pth
	        : getBasePath();
	      const clip = getClipboard();
	      copyOrMoveItem$1(clip.path, targetPath, clip.isCopy);
	      setClipboard(null);
	    // Cmd+Shift+N to create new folder
	    } else if (e.metaKey && e.shiftKey && e.key === 'n') {
	      e.preventDefault();

	      // Determine the folder path based on current selection
	      let folderPath = '/';
	      if (selectedLi.length) {
	        const anchor = selectedLi.find('a[title]');
	        if (anchor.length && anchor[0].dataset.path) {
	          // If selected item is a folder, create inside it
	          folderPath = decodeURIComponent(anchor[0].dataset.path);
	        } else {
	          // If selected item is a file, create in its parent folder
	          const span = selectedLi.find('span[title]');
	          if (span.length && span[0].dataset.path) {
	            folderPath = path.dirname(decodeURIComponent(span[0].dataset.path));
	          }
	        }
	      }

	      createNewFolder$1(folderPath);
	    // Enter key to rename
	    } else if (e.key === 'Enter' && selectedLi.length) {
	      e.preventDefault();
	      const textElement = selectedLi.find('span, a')[0];
	      if (textElement) {
	        startRename$1(textElement);
	      }
	    }
	  });

	  // Context menu for empty areas in column panes
	  $columns.on('contextmenu', (e) => {
	    e.preventDefault();

	    // Remove any existing context menus
	    /* c8 ignore next 4 -- Defensive cleanup; event listeners
	       should remove menus before this runs */
	    for (const menu of $$('.context-menu')) {
	      menu.remove();
	    }

	    // Find which column was clicked and get its path
	    const columnElement = /** @type {HTMLElement} */ (e.target);
	    const prevColumn = jQuery(columnElement).prevAll(
	      'ul.miller-column:not(.miller-collapse)'
	    ).first();
	    const selectedInPrev = prevColumn.find('li.miller-selected');

	    let folderPath = '/';
	    if (selectedInPrev.length) {
	      const anchor = selectedInPrev.find('a[title]');
	      if (anchor.length && anchor[0].dataset.path) {
	        folderPath = decodeURIComponent(anchor[0].dataset.path);
	      }
	    }

	    const customContextMenu = jmlExports.jml('ul', {
	      class: 'context-menu',
	      style: {
	        left: e.pageX + 'px',
	        top: e.pageY + 'px'
	      }
	    }, [
	      ['li', {
	        class: 'context-menu-item',
	        $on: {
	          click () {
	            customContextMenu.remove();
	            createNewFolder$1(folderPath);
	          }
	        }
	      }, [
	        'Create new folder'
	      ]],
	      ...(getClipboard()
	        ? [['li', {
	          class: 'context-menu-item',
	          $on: {
	            click () {
	              customContextMenu.remove();
	              const clip = getClipboard();
	              if (clip) {
	                copyOrMoveItem$1(clip.path, folderPath, clip.isCopy);
	              }
	            }
	          }
	        }, [
	          'Paste'
	        ]]]
	        : [])
	    ], document.body);

	    // Ensure main context menu is visible within viewport
	    requestAnimationFrame(() => {
	      const menuRect = customContextMenu.getBoundingClientRect();
	      const viewportWidth = window.innerWidth;
	      const viewportHeight = window.innerHeight;

	      // Adjust horizontal position if needed
	      if (menuRect.right > viewportWidth) {
	        customContextMenu.style.left =
	          (viewportWidth - menuRect.width - 10) + 'px';
	      }

	      /* c8 ignore next 4 -- Defensive as context menus should
	         be at positive pageX/pageY coordinates */
	      if (menuRect.left < 0) {
	        customContextMenu.style.left = '10px';
	      }

	      // Adjust vertical position if needed
	      if (menuRect.bottom > viewportHeight) {
	        customContextMenu.style.top =
	          (viewportHeight - menuRect.height - 10) + 'px';
	      }
	      /* c8 ignore next 4 -- Defensive as context menus should
	         be at positive pageX/pageY coordinates */
	      if (menuRect.top < 0) {
	        customContextMenu.style.top = '10px';
	      }
	    });

	    // Hide the custom context menu when clicking anywhere else
	    const hideCustomContextMenu = () => {
	      customContextMenu.remove();
	      document.removeEventListener('click', hideCustomContextMenu);
	      document.removeEventListener('contextmenu', hideCustomContextMenu);
	    };
	    document.addEventListener('click', hideCustomContextMenu, {
	      capture: true
	    });
	    document.addEventListener('contextmenu', hideCustomContextMenu, {
	      capture: true
	    });
	  });

	  if (currentBasePath !== '/') {
	    currentBasePath.split('/').slice(1).forEach(
	      (pathSegment, idx) => {
	        /* c8 ignore next 3 -- Guard for poorly formed paths */
	        if (pathSegment === '/') {
	          return;
	        }

	        const ulNth = jQuery(`ul.miller-column:nth-of-type(${
          idx + 1
        }):not(.miller-collapse)`);
	        // eslint-disable-next-line @stylistic/max-len -- Long
	        // console.log('ul idx:', idx + ', length:', ulNth.length, '::', pathSegment);
	        const anchors = ulNth.find('a[title]').filter(
	          function () {
	            return jQuery(this).text() === pathSegment;
	          }
	        );
	        // console.log('anchors', anchors.length);
	        anchors.trigger('click');
	        requestAnimationFrame(() => {
	          requestAnimationFrame(() => {
	            anchors[0]?.scrollIntoView({
	              block: 'start',
	              inline: 'start'
	            });
	          });
	        });
	      }
	    );
	  }

	  // Ensure the miller-columns container is focusable and
	  //   focused for keyboard navigation
	  if (view === 'three-columns') {
	    requestAnimationFrame(() => {
	      const millerColumnsDiv = $('div.miller-columns');
	      if (millerColumnsDiv) {
	        millerColumnsDiv.setAttribute('tabindex', '0');
	        millerColumnsDiv.focus();

	        // Add drop support only if not already added
	        if (!millerColumnsDiv.dataset.dropHandlerAdded) {
	          millerColumnsDiv.dataset.dropHandlerAdded = 'true';

	          // Add drop support for miller-columns background (empty space)
	          millerColumnsDiv.addEventListener('dragover', (e) => {
	            const {target} = e;
	            const targetEl = /** @type {HTMLElement} */ (target);
	            // Only handle drops on columns or empty space, not on list items
	            if (targetEl.classList.contains('miller-column') ||
	                targetEl === millerColumnsDiv) {
	              e.preventDefault();
	              if (e.dataTransfer) {
	                e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
	              }
	            }
	          });

	          millerColumnsDiv.addEventListener('drop', (e) => {
	            const {target} = e;
	            const targetEl = /** @type {HTMLElement} */ (target);
	            // Only handle drops on columns or empty space, not on list items
	            if (targetEl.classList.contains('miller-column') ||
	                targetEl === millerColumnsDiv) {
	              e.preventDefault();
	              e.stopPropagation();
	              const sourcePath = e.dataTransfer?.getData('text/plain');

	              // Determine target directory based on which column was clicked
	              let targetDir = getBasePath();
	              if (targetEl.classList.contains('miller-column')) {
	                // Find the selected item in the previous visible column
	                const columns = [
	                  ...millerColumnsDiv.querySelectorAll('ul.miller-column')
	                ];
	                const visibleColumns = columns.filter(
	                  (col) => !col.classList.contains('miller-collapse')
	                );
	                const columnIndex = visibleColumns.indexOf(targetEl);
	                if (columnIndex > 0) {
	                  const prevColumn = visibleColumns[columnIndex - 1];
	                  const selectedItem = prevColumn.querySelector(
	                    'li.miller-selected a'
	                  );
	                  if (selectedItem) {
	                    const selectedEl =
	                      /** @type {HTMLElement} */ (selectedItem);
	                    targetDir = selectedEl.dataset.path
	                      ? decodeURIComponent(selectedEl.dataset.path)
	                      : targetDir;
	                  }
	                }
	              }

	              if (sourcePath && targetDir && !getIsCopyingOrMoving()) {
	                copyOrMoveItem$1(sourcePath, targetDir, e.altKey);
	              }
	            }
	          });
	        } // Close the dropHandlerAdded check

	        // Add keyboard shortcuts for miller columns
	        const keydownListener = (e) => {
	          // Cmd+Shift+N to create new folder
	          if (e.metaKey && e.shiftKey && e.key === 'n') {
	            e.preventDefault();
	            const selected = millerColumnsDiv.querySelector(
	              '.list-item.selected a'
	            );
	            /* c8 ignore next 7 -- jQuery handler takes precedence */
	            if (selected) {
	              const selectedEl = /** @type {HTMLElement} */ (selected);
	              const folderPath = selectedEl.dataset.path;
	              if (folderPath) {
	                createNewFolder$1(decodeURIComponent(folderPath));
	              }
	            }
	          }
	        };

	        // Remove any existing keydown listeners to avoid duplicates
	        const oldListener = millerColumnsDiv._keydownListener;
	        if (oldListener) {
	          millerColumnsDiv.removeEventListener('keydown', oldListener);
	        }
	        millerColumnsDiv.addEventListener('keydown', keydownListener);
	        // @ts-expect-error Custom property
	        millerColumnsDiv._keydownListener = keydownListener;

	        // Add drag-and-drop support to all list items
	        const columnListItems = millerColumnsDiv.querySelectorAll(
	          '.list-item'
	        );
	        columnListItems.forEach((item) => {
	          const itemEl = /** @type {HTMLElement} */ (item);
	          const link = itemEl.querySelector('a, span');
	          if (link) {
	            const linkEl = /** @type {HTMLElement} */ (link);
	            const itemPath = linkEl.dataset.path;
	            if (itemPath) {
	              const isFolder = linkEl.tagName === 'A';
	              addDragAndDropSupport(itemEl, itemPath, isFolder);
	            }
	          }
	        });
	      }
	    });
	  }
	}

	globalThis.addEventListener('hashchange', changePath);

	// Add global keyboard handler for undo/redo
	document.addEventListener('keydown', (e) => {
	  // Only handle if not typing in an input field
	  /* c8 ignore next 5 - Defensive: keyboard shortcuts disabled in inputs */
	  const {target} = e;
	  const el = /** @type {Element} */ (target);
	  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
	    return;
	  }

	  // Cmd+Z for undo
	  if (e.metaKey && e.key === 'z' && !e.shiftKey) {
	    e.preventDefault();
	    performUndo();
	  } else if (e.metaKey && e.shiftKey && e.key === 'z') {
	    // Cmd+Shift+Z for redo
	    e.preventDefault();
	    performRedo();
	  }
	});


	$('#icon-view').addEventListener('click', function () {
	  $$('nav button').forEach((button) => {
	    button.classList.remove('selected');
	  });
	  this.classList.add('selected');
	  localStorage.setItem('view', 'icon-view');
	  $('.miller-breadcrumbs').style.display = 'block';
	  changePath();
	});
	$('#three-columns').addEventListener('click', function () {
	  $$('nav button').forEach((button) => {
	    button.classList.remove('selected');
	  });
	  this.classList.add('selected');
	  localStorage.setItem('view', 'three-columns');
	  $('.miller-breadcrumbs').style.display = 'block';
	  changePath();
	});

	const view = getCurrentView();
	switch (view) {
	case 'three-columns':
	case 'icon-view':
	  $('#' + view).classList.add('selected');
	  break;
	/* c8 ignore next 3 -- Guard */
	default:
	  throw new Error('Unrecognized view');
	}

	$('#filebrowser').title = `
    We are using Node.js ${process.versions.node},
    Chromium ${process.versions.chrome},
    and Electron ${process.versions.electron}.
`;

	$('#create-sticky').addEventListener('click', () => {
	  const currentView = getCurrentView();
	  const pth = currentView === 'icon-view'
	    ? jQuery('table[data-base-path]').attr('data-base-path')
	    : ($columns && $columns.find(
	      'li.miller-selected a, li.miller-selected span'
	    /* c8 ignore next 2 -- When tested alone, appears to be
	       covered by test that checks 2403, but not when testing together */
	    ).last()[0]?.dataset?.path) ?? '/';
	  const note = stickyNotes.createNote({
	    metadata: {type: 'local', path: pth},
	    html: `Welcome to Sticky Notes!<br /><br />

This sticky will only appear when the currently selected file or folder is
chosen.<br /><br />

Click "Create sticky for current path" to create more notes.`,
	    x: 100,
	    y: 150
	  });

	  addLocalStickyInputListeners(note, pth);
	});

	$('#create-global-sticky').addEventListener('click', () => {
	  const note = stickyNotes.createNote({
	    metadata: {type: 'global'},
	    html: `Welcome to Sticky Notes!<br /><br />

This sticky will show regardless of whatever file or folder is selected.
<br /><br />

Click "Create global sticky" to create more notes.`,
	    x: 150,
	    y: 170
	  });

	  addGlobalStickyInputListeners(note);
	});

	// eslint-disable-next-line @stylistic/max-len -- Long
	// eslint-disable-next-line unicorn/prefer-top-level-await -- Will be IIFE-exported
	(async () => {
	// We can't use `@default` for CSS path, so we've copied it out
	await addMillerColumnPlugin(jQuery, {stylesheets: ['miller-columns.css']});
	changePath();

	const saved = localStorage.getItem('stickyNotes-global');
	if (saved) {
	  stickyNotes.clear(({metadata}) => {
	    /* c8 ignore next -- Just a guard as stickies shouldn't exist on load */
	    return metadata.type === 'global';
	  });
	  stickyNotes.loadNotes(JSON.parse(saved));
	  stickyNotes.notes.forEach((note) => {
	    if (note.metadata.type === 'global') {
	      addGlobalStickyInputListeners(note);
	    }
	  });
	}
	})();

})();
//# sourceMappingURL=index.cjs.map
