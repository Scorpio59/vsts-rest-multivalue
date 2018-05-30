import * as JSONPath from "jsonpath";
import Q = require("q");
import * as WitService from "TFS/WorkItemTracking/Services";
import * as Utils_Array from "VSS/Utils/Array";
import * as VSSUtilsCore from "VSS/Utils/Core";
import * as Utils_String from "VSS/Utils/String";
import {BaseMultiValueControl} from "./BaseMultiValueControl";
import { callApi } from "./RestCall";

export class MultiValueCombo extends BaseMultiValueControl {
    /*
    * UI elements for the control.
    */
    private _selectedValuesWrapper: JQuery;
    private _selectedValuesContainer: JQuery;
    private _checkboxValuesContainer: JQuery;
    private _chevron: JQuery;

    private _suggestedValues: string[];
    private _valueToCheckboxMap: IDictionaryStringTo<JQuery>;
    private _valueToLabelMap: IDictionaryStringTo<JQuery>;

    private _maxSelectedToShow = 100;
    private _chevronDownClass = "bowtie-chevron-down-light";
    private _chevronUpClass = "bowtie-chevron-up-light";

    private _toggleThrottleDelegate: Function;
    /**
     * Initialize a new instance of MultiValueControl
     */
    public initialize(): void {
        this._selectedValuesWrapper = $("<div>").addClass("selectedValuesWrapper").appendTo(this.containerElement);
        this._selectedValuesContainer = $("<div>").addClass("selectedValuesContainer")
            .attr("tabindex", "-1").appendTo(this._selectedValuesWrapper);
        this._chevron = $("<span />").addClass("bowtie-icon " + this._chevronDownClass)
            .appendTo(this._selectedValuesWrapper);
        this._checkboxValuesContainer = $("<div>").addClass("checkboxValuesContainer").appendTo(this.containerElement);

        this._valueToCheckboxMap = {};
        this._valueToLabelMap = {};

        this._getSuggestedValues().then(
            (values: string[]) => {
                this._suggestedValues = values.filter((s: string): boolean => {
                    return s.trim() !== ""; });

                this._populateCheckBoxes();
                super.initialize();
            },
        );

        this._toggleThrottleDelegate = VSSUtilsCore.throttledDelegate(this, 100, () => {
            this._toggleCheckBoxContainer();
        });

        $(window).blur(() => {
            this._hideCheckBoxContainer();
            return false;
        });

        $(window).focus(() => {
            this._toggleThrottleDelegate.call(this);
            return false;
        });

        this._selectedValuesWrapper.click(() => {
            this._toggleThrottleDelegate.call(this);
            return false;
        });

        this._chevron.click(() => {
            this._toggleThrottleDelegate.call(this);
            return false;
        });

        $(window).keydown((eventObject) => {
            if (eventObject.keyCode === 38 /* Up */) {
                const focusedCheckBox = $("input:focus", this._checkboxValuesContainer);
                if (focusedCheckBox.length <= 0) {
                    // None selected, choose last
                    $("input:last", this._checkboxValuesContainer).focus();
                } else {
                    // One selected to choose previous if it exists
                    focusedCheckBox.parent().prev().find("input").focus();
                }

                return false;
            } else if (eventObject.keyCode === 40 /* Down */) {
                const focusedCheckBox = $("input:focus", this._checkboxValuesContainer);
                if (focusedCheckBox.length <= 0) {
                    // None selected, choose first
                    $("input:first", this._checkboxValuesContainer).focus();
                } else {
                    // One selected to choose previous if it exists
                    focusedCheckBox.parent().next().find("input").focus();
                }

                return false;
            } else {
                return true;
            }
        });
    }

    public clear(): void {
        const checkboxes: JQuery = $("input", this._checkboxValuesContainer);
        const labels: JQuery = $(".checkboxLabel", this._checkboxValuesContainer);
        checkboxes.prop("checked", false);
        checkboxes.removeClass("selectedCheckbox");
        this._selectedValuesContainer.empty();
    }

    protected getValue(): string {
        const selectedCheckboxes: JQuery = $("input.valueOption:checked", this._checkboxValuesContainer);
        let selectedValues: string[] = [];

        selectedCheckboxes.each((i: number, elem: HTMLElement) => {
            selectedValues.push($(elem).attr("value"));
        });

        selectedValues = Utils_Array.uniqueSort(selectedValues, Utils_String.localeIgnoreCaseComparer);
        return selectedValues.join(";");
    }

    protected setValue(value: string): void {
        this.clear();
        const selectedValues = value ? value.split(";") : [];

        this._showValues(selectedValues);

        $.each(selectedValues, (i, v) => {
            if (v) {
                // mark the checkbox as checked
                const checkbox = this._valueToCheckboxMap[v];
                const label = this._valueToLabelMap[v];
                if (checkbox) {
                    checkbox.prop("checked", true);
                    checkbox.addClass("selectedCheckbox");
                }
            }
        });
    }

    private _toggleCheckBoxContainer() {
        if (this._checkboxValuesContainer.is(":visible")) {
            this._hideCheckBoxContainer();
        } else {
            this._showCheckBoxContainer();
        }
    }

    private _showCheckBoxContainer() {
        this._chevron.removeClass(this._chevronDownClass).addClass(this._chevronUpClass);
        this.containerElement.addClass("expanded").removeClass("collapsed");
        this._checkboxValuesContainer.show();
        this.resize();
    }

    private _hideCheckBoxContainer() {
        this._chevron.removeClass(this._chevronUpClass).addClass(this._chevronDownClass);
        this.containerElement.removeClass("expanded").addClass("collapsed");
        this._checkboxValuesContainer.hide();
        this.resize();
    }

    private _showValues(values: string[]) {
        if (values.length <= 0) {
            this._selectedValuesContainer.append("<div class='noSelection'>No selection made</div>");
        } else {
            $.each(values, (i, value) => {
                let control;
                // only show first N selections and the rest as more.
                if (i < this._maxSelectedToShow) {
                    control = this._createSelectedValueControl(value);
                } else {
                    control = this._createSelectedValueControl(values.length - i + " more");
                    control.attr("title", values.slice(i).join(";"));
                    return false;
                }
            });
        }

        this._updateSelectAllControlState();

        this.resize();
    }

    private _refreshValues() {
        const rawValue = this.getValue();
        const values = rawValue ? rawValue.split(";") : [];
        this._selectedValuesContainer.empty();
        this._showValues(values);
    }

    private _createSelectedValueControl(value: string): JQuery {
        const control = $("<div />");
        if (value) {
            control.text(value);
            control.attr("title", value);
            control.addClass("selected");

            this._selectedValuesContainer.append(control);
        }

        return control;
    }

    /**
     * Populates the UI with the list of checkboxes to choose the value from.
     */
    private _populateCheckBoxes(): void {
        if (!this._suggestedValues || this._suggestedValues.length === 0) {
            this.showError("No values to select.");
        } else {
            // Add the select all method
            const selectAllBox = this._createSelectAllControl();

            $.each(this._suggestedValues, (i, value) => {
                this._createCheckBoxControl(value, selectAllBox);
            });
        }
    }

    private _updateSelectAllControlState() {
        const selectAllBox = $("input.selectAllOption", this._checkboxValuesContainer);
        const allBoxes = $("input.valueOption", this._checkboxValuesContainer);
        const checkedBoxes = $("input.valueOption:checked", this._checkboxValuesContainer);
        if (allBoxes.length > checkedBoxes.length) {
            selectAllBox.prop("checked", false);
        } else {
            selectAllBox.prop("checked", true);
        }
    }

    private _createSelectAllControl() {

        const value = "Select All";
        const label = this._createValueLabel(value);
        const checkbox = this._createCheckBox(value, label, () => {

            const checkBoxes = $("input.valueOption", this._checkboxValuesContainer);
            if (checkbox.prop("checked")) {
                checkBoxes.prop("checked", true);
            } else {
                checkBoxes.prop("checked", false);
            }

        });
        const container = $("<div />").addClass("checkboxContainer selectAllControlContainer");
        checkbox.addClass("selectAllOption");
        this._valueToCheckboxMap[value] = checkbox;

        this._valueToLabelMap[value] = label;

        container.append(checkbox);
        container.append(label);

        this._checkboxValuesContainer.append(container);

        return checkbox;
    }

    private _createCheckBoxControl(value: string, selectAllBox: JQuery) {

        const label = this._createValueLabel(value);
        const checkbox = this._createCheckBox(value, label);
        const container = $("<div />").addClass("checkboxContainer");
        checkbox.addClass("valueOption");
        this._valueToCheckboxMap[value] = checkbox;

        this._valueToLabelMap[value] = label;

        container.append(checkbox);
        container.append(label);

        this._checkboxValuesContainer.append(container);
    }

    private _createValueLabel(value: string) {
        const label = $("<label />");
        label.attr("for", "checkbox" + value);
        label.text(value);
        label.attr("title", value);
        label.addClass("checkboxLabel");
        return label;
    }

    private _createCheckBox(value: string, label: JQuery, action?: Function) {
        const checkbox = $("<input  />");
        checkbox.attr("type", "checkbox");
        checkbox.attr("name", value);
        checkbox.attr("value", value);
        checkbox.attr("tabindex", -1);
        checkbox.attr("id", "checkbox" + value);

        checkbox.change((e) => {

            if (action) {
                action.call(this);
            }

            this._refreshValues();
            this.flush();
        });

        return checkbox;
    }

    private _getSuggestedValues(): IPromise<string[]> {
        const defer = Q.defer<any>();
        const inputs: IDictionaryStringTo<string> = VSS.getConfiguration().witInputs;

        const url: string = inputs.Url;
        callApi(url, "GET", undefined, undefined, (data) => {
            defer.resolve(this._findArr(data));
        }, (error) => {
            defer.reject(error);
        });

        return defer.promise;
    }
    // Convert unknown data type to string[]
    private _findArr(data: object): string[] {
        const inputs: IDictionaryStringTo<string> = VSS.getConfiguration().witInputs;
        const property: string = inputs.Property;
        if (property && property[0] === "$") {
            return JSONPath.query(data, property);
        }
        // Look for an array: object itself or one of its properties
        const objs: object[] = [data];
        for (let obj = objs.shift(); obj; obj = objs.shift()) {
            if (Array.isArray(obj)) {
                // If configuration has a the Property property set then map from objects to strings
                // Otherwise assume already strings
                return property ? obj.map((o) => o[property]) : obj;
            } else if (typeof obj === "object") {
                for (const key in obj) {
                    objs.push(obj[key]);
                }
            }
        }
    }
}
