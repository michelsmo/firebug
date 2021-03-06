/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/css/selectorEditor",
],
function(Firebug, Obj, Locale, Events, Dom, Domplate, SelectorEditor) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);

// ********************************************************************************************* //
// CSS Selector Panel

/**
 * @panel Selector side panel displaying HTML elements for the current selector,
 * either from the CSS main panel or user entry
 */
function SelectorPanel() {}
SelectorPanel.prototype = Obj.extend(Firebug.Panel,
/** @lends SelectorPanel */
{
    name: "selector",
    parentPanel: "stylesheet",
    title: Locale.$STR("css.selector.Selection"),
    editable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Firebug.Panel.initializeNode.apply(this, arguments);

        this.setSelection = Obj.bind(this.setSelection, this);
        this.clearSelection = Obj.bind(this.clearSelection, this);
        this.lockSelection = Obj.bind(this.lockSelection, this);

        var panelNode = this.mainPanel.panelNode;
        Events.addEventListener(panelNode, "mouseover", this.setSelection, false);
        Events.addEventListener(panelNode, "mouseout", this.clearSelection, false);
        Events.addEventListener(panelNode, "mousedown", this.lockSelection, false);
    },

    destroyNode: function()
    {
        var panelNode = this.mainPanel.panelNode;
        Events.removeEventListener(panelNode, "mouseover", this.setSelection, false);
        Events.removeEventListener(panelNode, "mouseout", this.clearSelection, false);
        Events.removeEventListener(panelNode, "mousedown", this.lockSelection, false);

        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);

        this.refresh();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCSSStyleRule: function(event)
    {
        var object = Firebug.getRepObject(event.target);

        if (object && (object instanceof window.CSSStyleRule))
            return object;
    },

    getCSSRuleElement: function(element)
    {
        while (element && !element.classList.contains("cssRule"))
            element = element.parentNode;

        return element;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Selection

    setSelection: function(event)
    {
        var rule = this.getCSSStyleRule(event);

        if (rule)
        {
            // then we have entered a rule element
            var ruleElement = this.getCSSRuleElement(event.target);
            if (ruleElement && ruleElement !== this.lockedElement)
                ruleElement.classList.add("selectedSelectorRule");

            this.selection = rule;
            this.rebuild();
        }
    },

    clearSelection: function(event)
    {
        if (this.selection !== this.lockedSelection)
        {
            this.selection = this.lockedSelection;
            this.rebuild();
        }

        var rule = this.getCSSStyleRule(event);
        if (rule)
        {
            // then we are leaving a rule element that we may have highlighted.
            var ruleElement = this.getCSSRuleElement(event.target);
            if (ruleElement)
                ruleElement.classList.remove("selectedSelectorRule");
        }
    },

    lockSelection: function(event)
    {
        var rule = this.getCSSStyleRule(event);
        if (rule)
        {
            if (this.lockedElement)
                this.lockedElement.classList.remove("lockedSelectorRule");

            this.lockedElement = this.getCSSRuleElement(event.target);

            if (this.lockedElement)
            {
                this.lockedElement.classList.add("lockedSelectorRule");
                this.lockedElement.classList.remove("selectedSelectorRule");
            }

            this.lockedSelection = rule;
        }
    },

    hide: function()
    {
        Firebug.Panel.hide.apply(this, arguments);
    },

    refresh: function()
    {
        var root = this.context.window.document.documentElement;
        this.selection = this.mainPanel.selection;
        this.rebuild(true);
    },

    /**
     * returns an array of Elements matched from selector
     */
    getSelectedElements: function(selectorText)
    {
        var selections = Firebug.currentContext.window.document.querySelectorAll(selectorText);

        // For some reason the return value of querySelectorAll()
        // is not recognized as a NodeList anymore since Firefox 10.0.
        // See issue 5442.
        if (selections)
        {
            var elements = [];
            for (var i=0; i<selections.length; i++)
                elements.push(selections[i]);

            return elements;
        }
        else
        {
            throw new Error("Selection Failed: " + selections);
        }
    },

    /**
     * Build content of the panel. The basic layout of the panel is generated by
     * {@link SelectorTemplate} template.
     */
    rebuild: function()
    {
        if (this.selection)
        {
            try
            {
                var selectorText;

                if (this.selection instanceof window.CSSStyleRule)
                    selectorText = this.selection.selectorText;
                else
                    selectorText = this.selection;

                var elements = this.getSelectedElements(selectorText);
                if (elements && elements.length != 0)
                {
                    SelectorTemplate.tag.replace({object: elements}, this.panelNode);
                    this.showTrialSelector(this.trialSelector);
                    return;
                }
            }
            catch (e)
            {
                var table = SelectorTemplate.tag.replace({object: []}, this.panelNode);
                var tbody = table.lastChild;

                WarningTemplate.selectErrorTag.insertRows({object: e}, tbody.lastChild);
                WarningTemplate.selectErrorTextTag.insertRows({object: e}, tbody.lastChild);

                this.showTrialSelector(this.trialSelector);
                return;
            }
        }

        var table = SelectorTemplate.tag.replace({object: []}, this.panelNode);
        var tbody = table.lastChild;

        if (this.trialSelector)
        {
            WarningTemplate.noSelectionResultsTag.insertRows(
                {object: this.selection}, tbody.lastChild)
        }
        else
        {
            WarningTemplate.noSelectionTag.insertRows(
                {object: this.selection}, tbody.lastChild);
        }

        this.showTrialSelector(this.trialSelector);
    },

    getObjectPath: function(object)
    {
        if (FBTrace.DBG_SELECTOR)
            FBTrace.sysout("css.selector.getObjectPath NOOP", object);
    },

    supportsObject: function(object)
    {
        return 0;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tryASelector:function(element)
    {
        if (!this.trialSelector)
            this.trialSelector = this.selection ? this.selection.selectorText : "";

        this.editProperty(element, this.trialSelector);
    },

    editProperty: function(row, editValue)
    {
        Firebug.Editor.startEditing(row, editValue);
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new SelectorEditor(this);

        return this.editor;
    },

    setTrialSelector: function(target, value)
    {
        if (this.lockedElement)
            this.lockedElement.classList.remove("lockedSelectorRule");

        this.trialSelector = value;
        this.selection = this.trialSelector;
        this.lockedElement = target;
        this.lockedSelection = this.selection;
        this.rebuild();
    },

    showTrialSelector: function(trialSelector)
    {
        var show = trialSelector ? true : false;
        Dom.collapse(this.document.getElementById("trialHint"), show);

        var trialSelectorDiv = this.document.getElementById("trialSelector");
        trialSelectorDiv.textContent = trialSelector;
        Dom.collapse(trialSelectorDiv, !show);
    },
});

// ********************************************************************************************* //

var BaseRep = domplate(Firebug.Rep,
{
    // xxxHonza: shouldn't this be in Firebug.Rep?
    getNaturalTag: function(value)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        return tag;
    }
});

// ********************************************************************************************* //

var TrialRow =
    TR({"class": "watchNewRow", level: 0, onclick: "$onClickEditor"},
        TD({"class": "watchEditCell", colspan: 3},
            DIV({"class": "watchEditBox a11yFocusNoTab", "id": "trialHint",
                role: "button", "tabindex" : "0",
                "aria-label": Locale.$STR("a11y.labels.press enter to add new selector")},
                Locale.$STR("css.selector.TryASelector")
            ),
            DIV({"class": "trialSelector", "id": "trialSelector"}, "")
        )
    );

// ********************************************************************************************* //

/**
 * @domplate: Template for basic layout of the {@link SelectorPanel} panel.
 */
var SelectorTemplate = domplate(BaseRep,
{
    // object will be array of elements CSSStyleRule
    tag:
        TABLE({"class": "cssSelectionTable", cellpadding: 0, cellspacing: 0},
            TBODY({"class": "cssSelectionTBody"},
                TrialRow,
                FOR("element", "$object",
                    TR({"class": "selectionElementRow", _repObject: "$element"},
                        TD({"class": "selectionElement"},
                            TAG( "$element|getNaturalTag", {object: "$element"})
                        )
                    )
                )
            )
        ),

    onClickEditor: function(event)
    {
        var tr = event.currentTarget;
        var panel = Firebug.getElementPanel(tr);
        panel.tryASelector(tr);
    },
});

// ********************************************************************************************* //

var WarningTemplate = domplate(Firebug.Rep,
{
    noSelectionTag:
        TR({"class": "selectbugWarning "},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.noSelection"))
        ),

    noSelectionResultsTag:
        TR({"class": "selectbugWarning "},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.noSelectionResults"))
        ),

    selectErrorTag:
        TR({"class": "selectbugWarning"},
            TD({"class": "selectionElement"}, Locale.$STR("css.selector.selectorError"))
        ),

    selectErrorTextTag:
        TR({"class": "selectbugWarning"},
            TD({"class": "selectionErrorText selectionElement"}, SPAN("$object"))
        ),
});

// ********************************************************************************************* //
// Registration

Firebug.registerStylesheet("chrome://firebug/skin/selector.css");
Firebug.registerPanel(SelectorPanel);

return SelectorPanel;

// ********************************************************************************************* //
}});
