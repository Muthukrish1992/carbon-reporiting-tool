import React, { useEffect, useRef, useState } from "react";
import Highcharts from "highcharts";
import {
  WidgetWrapper,
  TitleBar,
  FilterPanel,
  FormField,
  Select,
  Input,
  Label,
  useToast,
} from "uxp/components";
import { IContextProvider } from "./uxp";
import "./AnnualCarbonChart.scss";

export interface IWidgetProps {
  uxpContext?: IContextProvider;
  instanceId?: string;
  uiProps?: any;
}

// Emission factors for calculations
const emissionFactors: { [key: string]: number } = {
  "Generator Fuel Consumption": 3.761, // kgCO₂e per litre
  "Refrigerant Leakages/Refilling": 1.0, // kgCO₂e per litre
  "Electricity Consumption": 0.412, // kgCO₂e per kWh
};

const AnnualCarbonEmissionWithBaselineComparison: React.FunctionComponent<
  IWidgetProps
> = (props) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<Highcharts.Chart | null>(null);
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState<any>(null); // Changed: Start with null to show all years

  const [availableActivities, setAvailableActivities] = useState<string[]>([]);
  const [baselineYear, setBaselineYear] = useState<any>(2022); // default baseline year
  const [availableYears, setAvailableYears] = useState<any[]>([]); // dropdown years
  const [availableBaselineYears, setAvailableBaselineYears] = useState<any[]>([]);
  const [baselineData, setBaselineData] = useState<any[]>([]); // Store baseline data

  // Fetch available activities
  const fetchAvailableActivities = async () => {
    try {
      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "getAllActivities",
        {},
        { json: true }
      );
      setAvailableActivities(result || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  };

  // Fetch baseline data and years
  const fetchBaselineYears = async () => {
    try {
      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "getAllBaselines",
        {},
        { json: true }
      );

      if (result && Array.isArray(result)) {
        setBaselineData(result); // Store the full baseline data
        const years = Array.from(new Set(result.map((r: any) => r.year))).sort();
        setAvailableBaselineYears(years);
        if (years.length > 0 && !years.includes(baselineYear)) {
          setBaselineYear(years[0]); // default to first baseline year if not set
        }
      }
    } catch (error) {
      console.error("Error fetching baseline years:", error);
      setAvailableBaselineYears([2022]); // fallback
      setBaselineData([]); // Clear baseline data on error
    }
  };

  // Fetch baseline year from backend
  const fetchBaselineYear = async () => {
    try {
      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "getSelectedBaselineYear",
        {},
        { json: true }
      );

      if (result && result.year) {
        setBaselineYear(result.year);
      } else {
        setBaselineYear(2022); // fallback default
      }
    } catch (error) {
      console.error("Error fetching baseline year:", error);
      setBaselineYear(2022); // fallback
    }
  };

  // Modified: Fetch activity data - pass null for year to get all years, or specific year for filtering
  const fetchActivityData = async () => {
    if (!props.uxpContext) return;

    setLoading(true);
    try {
      const result = await props.uxpContext.executeAction(
        "carbon_reporting_80rr",
        "GetAllData",
        { 
          year: yearFilter, // This will be null for all years, or specific year for filtering
          month: null, 
        },
        { json: true }
      );

      const cleanedData =
        result?.map((row: any) => ({
          activity: row.activity,
          year: row.year,
          month: row.month,
          value: parseFloat(row.value),
        })) || [];

      setActivityData(cleanedData);

      // Build available years for baseline dropdown
      const years = Array.from(new Set(cleanedData.map((d: any) => d.year))).sort();
      setAvailableYears(years);
    } catch (error: any) {
      console.error("Error loading emission data:", error);
      toast.error("Failed to load activity data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableActivities();
    fetchBaselineYear(); // fetch baseline year on mount
    fetchBaselineYears();
  }, []);

  useEffect(() => {
    fetchActivityData();
  }, [yearFilter]);

  // Calculate annual emissions by year
  const calculateAnnualEmissions = () => {
    if (activityData.length === 0) return [];

    console.log("Raw activity data:", activityData);

    const yearlyEmissions: { [key: string]: { scope1: number; scope2: number } } =
      {};

    activityData.forEach((item) => {
      const year = item.year.toString();
      if (!yearlyEmissions[year]) {
        yearlyEmissions[year] = { scope1: 0, scope2: 0 };
      }

      const emissionFactor = emissionFactors[item.activity] || 0;
      const calculatedEmission = item.value * emissionFactor;

      // Use exact same logic as working ESGStackedBarChart
      const isScope1 = item.activity.includes("Generator") || item.activity.includes("Refrigerant");
      
      console.log(`Activity: "${item.activity}", isScope1: ${isScope1}, emission: ${calculatedEmission}, emissionFactor: ${emissionFactor}`);

      if (isScope1) {
        yearlyEmissions[year].scope1 += calculatedEmission;
      } else {
        yearlyEmissions[year].scope2 += calculatedEmission;
      }
    });

    const result = Object.keys(yearlyEmissions)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((year) => ({
        year: parseInt(year),
        scope1: yearlyEmissions[year].scope1,
        scope2: yearlyEmissions[year].scope2,
        total: yearlyEmissions[year].scope1 + yearlyEmissions[year].scope2,
      }));

    console.log("Calculated annual emissions:", result);
    console.log("Yearly emissions breakdown:", yearlyEmissions);

    return result;
  };

  const annualData = calculateAnnualEmissions();

  // Calculate baseline value from baseline data
  const calculateBaselineValue = () => {
    if (baselineData.length === 0 || !baselineYear) {
      console.log("No baseline data or year, using fallback");
      return 4000; // fallback
    }

    // Filter baseline data for the selected year and activity
    const filteredBaselines = baselineData.filter((item: any) => {
      const yearMatches = item.year === baselineYear;
      return yearMatches 
    });

    console.log("Filtered baselines:", filteredBaselines);

    if (filteredBaselines.length === 0) {
      console.log("No matching baseline found, using fallback");
      return 4000; // fallback if no matching baseline found
    }

    // If the baseline data already contains calculated emissions (kgCO2e), use it directly
    // Otherwise, apply emission factors
    let totalBaseline = 0;
    filteredBaselines.forEach((item: any) => {
      // Check if the value is already in kgCO2e (likely if it's a large number like 1293)
      // or if it needs to be multiplied by emission factor
      const rawValue = parseFloat(item.value || 0);
      
      // If the baseline value is already calculated emissions, use it directly
      // You can identify this by checking if it's a reasonable emission value
      if (rawValue > 100) {
        // Likely already calculated emissions
        totalBaseline += rawValue;
      } else {
        // Apply emission factor
        const emissionFactor = emissionFactors[item.activity] || 0;
        totalBaseline += rawValue * emissionFactor;
      }
    });

    console.log("Calculated baseline value:", totalBaseline);
    return totalBaseline;
  };

  const baselineValue = calculateBaselineValue();

  console.log('baselineYear:', baselineYear);
  console.log('baselineValue:', baselineValue);
  console.log('baselineData:', baselineData);

  // Modified: Chart title to reflect filtering state
  const getChartTitle = () => {
    if (yearFilter) {
      return `${yearFilter} Scope 1 & 2 Carbon Emissions vs Baseline (${baselineYear})`;
    }
    return `Annual Scope 1 & 2 Carbon Emissions vs Baseline (${baselineYear})`;
  };

  // Build chart
  useEffect(() => {
    if (chartRef.current && annualData.length > 0) {
      const years = annualData.map((d) => d.year.toString());
      const scope1Data = annualData.map((d) => d.scope1);
      const scope2Data = annualData.map((d) => d.scope2);

      // constant baseline across all years
      const baselineSeries = years.map(() => baselineValue);

      const chartConfig: Highcharts.Options = {
        chart: {
          type: "column", // vertical stacked
          height: 450,
          backgroundColor: "transparent",
        },
        title: {
          text: getChartTitle(),
          style: { fontSize: "20px", fontWeight: "bold" },
        },
        xAxis: {
          categories: years,
          title: { text: "Year" },
        },
        yAxis: {
          min: 0,
          title: { text: "Carbon Emissions (kgCO₂e)" },
          plotLines:
            baselineValue > 0
              ? [
                  {
                    color: "red",
                    dashStyle: "Dash",
                    width: 3, // Made thicker for visibility
                    value: baselineValue,
                    zIndex: 10, // Higher z-index to ensure it's on top
                    label: {
                      text: `Baseline ${baselineYear}: ${Math.round(baselineValue).toLocaleString()} kgCO₂e`,
                      align: "right",
                      verticalAlign: "bottom",
                      style: { 
                        color: "red", 
                        fontWeight: "bold",
                        backgroundColor: "white",
                        padding: "2px"
                      },
                      y: -5,
                    },
                  },
                ]
              : [],
        },

        plotOptions: {
          column: {
            stacking: "normal",
            dataLabels: {
              enabled: true,
              formatter: function () {
                return this.y && this.y > 0 ? this.y.toLocaleString() : "";
              },
            },
          },
        },
        series: [
          {
            name: "Scope 1",
            data: scope1Data,
            type: "column",
            color: "#1f77b4",
          },
          {
            name: "Scope 2",
            data: scope2Data,
            type: "column",
            color: "#ff7f0e",
          }
        ],
        tooltip: {
          shared: true,
          footerFormat: "Total: <b>{point.total}</b> kgCO₂e",
        },
        legend: { enabled: true },
        credits: { enabled: false },
      };

      chartInstance.current = Highcharts.chart(chartRef.current, chartConfig);

      // Add % change annotations above bars
      if (baselineValue > 0) {
        setTimeout(() => {
          annualData.forEach((d, i) => {
            const pctChange =
              ((d.total - baselineValue) / baselineValue) * 100 || 0;
            const label = `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(
              1
            )}% vs ${baselineYear}`;

            if (chartInstance.current && chartInstance.current.xAxis && chartInstance.current.yAxis) {
              const xPos = chartInstance.current.xAxis[0].toPixels(i);
              const yPos = chartInstance.current.yAxis[0].toPixels(d.total) - 15;
              
              console.log(`Adding annotation at position: x=${xPos}, y=${yPos}, label=${label}`);

              chartInstance.current.renderer
                .text(
                  label,
                  xPos - 30, // Center the text better
                  yPos
                )
                .css({ 
                  color: "#000", 
                  fontSize: "11px", 
                  fontWeight: "bold",
                  textAnchor: "middle"
                })
                .add();
            }
          });
        }, 100); // Small delay to ensure chart is fully rendered
      }
    }
  }, [annualData, baselineValue, baselineYear]);

  // Activity dropdown options
  const activityOptions = [
    { label: "All Activities", value: "" },
    ...availableActivities.map((a) => ({ label: a, value: a })),
  ];

  // Modified: Year dropdown options - include "All Years" option
  const yearOptions = [
    { label: "All Years", value: null },
    ...availableYears.map((y) => ({ label: y.toString(), value: y })),
  ];

  return (
    <WidgetWrapper>
      <TitleBar title="Annual Carbon Emissions with Baseline Comparison">
        <FilterPanel
          onClear={() => {
            setYearFilter(null); // Changed: Clear to show all years
            // Set to lowest available baseline year
            if (availableBaselineYears.length > 0) {
              const lowestYear = Math.min(...availableBaselineYears);
              setBaselineYear(lowestYear);
            } else {
              setBaselineYear(2022);
            }
          }}
        >
          <FormField>
            <Label>Filter by Year</Label>
            <Select
              options={yearOptions}
              selected={yearFilter}
              onChange={(val) => setYearFilter(val)}
              placeholder="Select year or show all"
            />
          </FormField>

          <FormField> 
            <Label>Select Baseline Year</Label>
            <Select
              options={availableBaselineYears.map((y) => ({ label: y.toString(), value: y }))}
              selected={baselineYear}
              onChange={(val) => setBaselineYear(val)}
              placeholder="Select baseline year"
            />
          </FormField>
        </FilterPanel>
      </TitleBar>

      <div className="annual-carbon-chart">
        {loading && <div>📊 Loading emission data...</div>}

        {!loading && annualData.length === 0 && (
          <div>📈 No emission data found for selected filters.</div>
        )}

        {!loading && annualData.length > 0 && (
          <div ref={chartRef} className="annual-carbon-chart__chart" />
        )}
      </div>
    </WidgetWrapper>
  );
};

export default AnnualCarbonEmissionWithBaselineComparison;