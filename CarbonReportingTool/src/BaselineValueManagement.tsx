import React, { useEffect, useState } from "react";
import {
  WidgetWrapper,
  TitleBar,
  FormField,
  Input,
  Label,
  Button,
  useToast,
  Modal,
} from "uxp/components";
import { IContextProvider } from "./uxp";
import "./BaselineValueManagement.scss";

export interface IWidgetProps {
  uxpContext?: IContextProvider;
  instanceId?: string;
  uiProps?: any;
}

interface BaselineValue {
  year: number;
  value: number;
}

const BaselineValueManagement: React.FunctionComponent<IWidgetProps> = (props) => {
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingBaselines, setExistingBaselines] = useState<BaselineValue[]>([]);
  
  // Form state
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [value, setValue] = useState<string>("");

  // 🔹 Fetch existing baseline values
  const fetchExistingBaselines = async () => {
    setLoading(true);
    try {
      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "getAllBaselines",
        {},
        { json: true }
      );
      setExistingBaselines(result || []);
    } catch (error) {
      console.error("Error fetching baselines:", error);
      setExistingBaselines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExistingBaselines();
  }, []);

  // 🔹 Check if baseline exists (exact year match)
  const checkExistingBaseline = (yearToCheck: string): BaselineValue | null => {
    return (
      existingBaselines.find(
        (baseline) => Number(baseline.year) === Number(yearToCheck)
      ) || null
    );
  };

  // 🔹 Validate form
// Validation (only ensure year is not empty)
const validateForm = (): string | null => {
  if (!year.trim()) {
    return "Please enter a valid year or name.";
  }
  if (!value.trim() || isNaN(Number(value)) || Number(value) < 0) {
    return "Please enter a valid positive number for the baseline value.";
  }
  return null;
};

  // 🔹 Handle form submission
const handleSubmit = async () => {
  const validationError = validateForm();
  if (validationError) {
    toast.error(validationError);
    return;
  }

  const existing = checkExistingBaseline(year);
  console.log("Submitting", { year, value, existing });

  if (existing) {
    const confirmUpdate = window.confirm(
      `A baseline value already exists for year ${year}. Do you want to override it?`
    );
    if (confirmUpdate) {
      await saveBaseline();
    } else {
      toast.info("Update cancelled. No changes were made.");
    }
  } else {
    await saveBaseline();
  }
};


  // 🔹 Save baseline value
const saveBaseline = async () => {
  setSaving(true);
  try {
    const baselineData = {
      year:year.trim(),
      value: Number(value),
    };

    console.log("Calling InsertBaselineValue with:", baselineData);

    await props.uxpContext?.executeAction(
      "carbon_reporting_80rr",
      "InsertBaselineValue",
      baselineData,
      { json: true }
    );  
    toast.success("Baseline value saved successfully!");
    resetForm();
    await fetchExistingBaselines();

  } catch (error) {
    console.error("Error saving baseline:", error);
    toast.error("Failed to save baseline value. Please try again.");
  } finally {
    setSaving(false);
  }
};

  // 🔹 Reset form to initial state
  const resetForm = () => {
    setYear(new Date().getFullYear().toString());
    setValue("");
  };


  return (
    <WidgetWrapper>
      <TitleBar title="Baseline Value Management" />

      <div className="baseline-management">
        {loading && <div className="loading">📊 Loading baseline data...</div>}

        {!loading && (
          <div className="baseline-form">
            <div className="form-section">
              <h3>Add/Update Baseline Value</h3>

              <FormField>
                <Label>Year / Name *</Label>
                <div className="year-input-container">
                  <Input
                    type="text"
                    value={year}
                    onChange={(val) => setYear(val)}
                    placeholder="Enter year or name"
                    className="year-input"
                  />
                </div>
              </FormField>

              <FormField>
                <Label>Baseline Value (kgCO₂e) *</Label>
                <Input
                  type="text"
                  value={value}
                  onChange={(val) => setValue(val)}
                  placeholder="Enter baseline emission value"
                />
              </FormField>

              <div className="form-actions">
                <Button
                  title="submit"
                  onClick={handleSubmit}
                  loading={saving}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Baseline"}
                </Button>
                
                <Button
                  title="cancel"
                  onClick={resetForm}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Existing Baselines Table */}
            {existingBaselines.length > 0 && (
              <div className="existing-baselines">
                <h3>Existing Baseline Values</h3>
                <div className="baseline-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Value (kgCO₂e)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingBaselines.map((baseline, index) => (
                        <tr key={index}>
                          <td>{baseline.year}</td>
                          <td>{baseline.value.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </WidgetWrapper>
  );
};

export default BaselineValueManagement; 