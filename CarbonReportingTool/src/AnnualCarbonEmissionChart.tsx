import React, { useEffect, useRef, useState } from "react";
import Highcharts from 'highcharts';
import { WidgetWrapper, TitleBar, FilterPanel, FormField, Select, Input, Label, useToast, Button } from "uxp/components";
import { IContextProvider } from "./uxp";
import './AnnualCarbonChart.scss';

export interface IWidgetProps {
  uxpContext?: IContextProvider;
  instanceId?: string;
  uiProps?: any;
}

// Emission factors for calculations
const emissionFactors: { [key: string]: number } = {
  "Generator Fuel Consumption": 3.761, // kgCO₂e per litre
  "Refrigerant Leakages/Refilling": 1.000, // kgCO₂e per litre
  "Electricity Consumption": 0.412 // kgCO₂e per kWh
};

const AnnualCarbonEmissionChart: React.FunctionComponent<IWidgetProps> = (props) => {
  const chartRef = useRef(null);
  const toast = useToast();
  const chartInstance = useRef<Highcharts.Chart | null>(null);
  const [selectedLegend, setSelectedLegend] = useState<string | null>("all");

  const [loading, setLoading] = useState(false);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState<any>(new Date().getFullYear());
  const [activityName, setActivityName] = useState<string>("");
  const [availableActivities, setAvailableActivities] = useState<string[]>([]); // 🆕 for dropdown options
    // 🆕 Fetch available activities for dropdown
  const fetchAvailableActivities = async () => {
    try {
      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "getAllActivities",
        {},
        { json: true }
      );
      console.log("Available activities:", result);
      setAvailableActivities(result || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  };
    // 🆕 Load activities on component mount
    useEffect(() => {
      fetchAvailableActivities();
    }, []);
  const fetchActivityData = async () => {
    if (!props.uxpContext) return;

    setLoading(true);
    try {
      const result = await props.uxpContext.executeAction(
        "carbon_reporting_80rr",
        "GetAllData",
        { year: yearFilter, month: null, activityName: activityName },
        { json: true }
      );

      console.log("Fetched annual emission data:", result);

      const cleanedData = result?.map((row: any) => ({
        activity: row.activity,
        year: row.year,
        month: row.month,
        value: parseFloat(row.value)
      })) || [];

      setActivityData(cleanedData);
    } catch (error: any) {
      console.error("Error loading annual emission data:", error);
      toast.error("Failed to load activity data.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate annual emissions aggregated by scope
  const calculateAnnualEmissions = () => {
    if (activityData.length === 0) {
      return {
        annualData: [],
        totalScope1: 0,
        totalScope2: 0,
        totalEmissions: 0
      };
    }

    // Group by year and calculate scope totals
    const yearlyEmissions: { [key: string]: { scope1: number, scope2: number } } = {};

    activityData.forEach(item => {
      const year = item.year.toString();
      if (!yearlyEmissions[year]) {
        yearlyEmissions[year] = { scope1: 0, scope2: 0 };
      }

      const emissionFactor = emissionFactors[item.activity] || 0;
      const calculatedEmission = item.value * emissionFactor;

      // Determine scope based on activity type
      const isScope1 = item.activity.includes("Generator") || item.activity.includes("Refrigerant");

      if (isScope1) {
        yearlyEmissions[year].scope1 += calculatedEmission;
      } else {
        yearlyEmissions[year].scope2 += calculatedEmission;
      }
    });

    // Convert to array format for chart
    const annualData = Object.keys(yearlyEmissions)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(year => ({
        year: parseInt(year),
        scope1: yearlyEmissions[year].scope1,
        scope2: yearlyEmissions[year].scope2,
        total: yearlyEmissions[year].scope1 + yearlyEmissions[year].scope2
      }));

    const totalScope1 = annualData.reduce((sum, item) => sum + item.scope1, 0);
    const totalScope2 = annualData.reduce((sum, item) => sum + item.scope2, 0);
    const totalEmissions = totalScope1 + totalScope2;

    return { annualData, totalScope1, totalScope2, totalEmissions };
  };
  const exportToCSV = () => {
    const { annualData } = calculateAnnualEmissions();

    if (!annualData.length) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Year", "Scope 1 (KgCO2e)", "Scope 2 (KgCO2e)", "Total (KgCO2e)"];
    const rows = annualData.map(row => [
      row.year,
      row.scope1.toFixed(2),
      row.scope2.toFixed(2),
      row.total.toFixed(2)
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "annual_carbon_emissions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const { annualData, totalScope1, totalScope2, totalEmissions } = calculateAnnualEmissions();

  const showAllSeries = () => {
    chartInstance.current?.series.forEach(s => s.show());
  };

  const showOnlySeries = (name: string) => {
    chartInstance.current?.series.forEach(s => {
      if (s.name === name) s.show();
      else s.hide();
    });
  };

  useEffect(() => {
    fetchActivityData();
  }, [yearFilter, activityName]);

  useEffect(() => {
    if (chartRef.current && annualData.length > 0) {
      const years = annualData.map(item => item.year.toString());
      const scope1Data = annualData.map(item => selectedLegend === "all" || selectedLegend === "Scope 1" ? item.scope1 : 0);
      const scope2Data = annualData.map(item => selectedLegend === "all" || selectedLegend === "Scope 2" ? item.scope2 : 0);

      // Highcharts configuration for annual stacked bar chart
      const chartConfig: Highcharts.Options = {
        chart: {
          type: 'column',
          height: 450,
          backgroundColor: 'transparent',
          spacing: [20, 20, 20, 20]
        },
        title: {
          text: `Annual Carbon Emissions by Scope (${yearFilter})`,
          style: {
            fontSize: '22px',
            fontWeight: 'bold',
            color: '#2c3e50'
          }
        },

        xAxis: {
          categories: years,
          title: {
            text: 'Year',
            style: {
              fontSize: '14px',
              fontWeight: 'bold'
            }
          },
          gridLineWidth: 0,
          lineWidth: 1,
          lineColor: '#ccc'
        },
        yAxis: {
          min: 0,
          title: {
            text: 'Carbon Emissions (kgCO₂e)',
            style: {
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#666'
            }
          },
          labels: {
            style: {
              color: '#666',
              fontSize: '11px'
            },
            formatter: function () {
              return (this.value as number).toLocaleString();
            }
          },
          gridLineWidth: 1,
          gridLineColor: '#e6e6e6',
          stackLabels: {
            enabled: true,
            style: {
              fontWeight: 'bold',
              color: '#2c3e50',
              fontSize: '11px'
            },
            formatter: function () {
              // Add null check for this.total
              const total = this.total as number;
              return total != null ? total.toLocaleString() + ' kgCO₂e' : '';
            }
          }
        },
        tooltip: {
          headerFormat: '<b>Year {point.key}</b><br/>',
          pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y:,.1f} kgCO₂e</b><br/>',
          footerFormat: 'Total: <b>{point.total:,.1f} kgCO₂e</b>',
          shared: true,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderColor: '#ccc',
          borderRadius: 8,
          shadow: true,
          formatter: function () {
            let tooltip = `<b>Year ${this.x}</b><br/>`;

            this.points?.forEach(point => {
              tooltip += `<span style="color:${point.series.color}">${point.series.name}</span>: <b>${point.y?.toLocaleString() || '0'} kgCO₂e</b><br/>`;
            });

            const total = this.points?.reduce((sum, point) => sum + (point.y || 0), 0);
            if (total != null) {
              tooltip += `Total: <b>${total.toLocaleString()} kgCO₂e</b>`;
            }

            return tooltip;
          }
        },
        legend: {
          enabled: false // Disable the default legend
        },
        plotOptions: {
          column: {
            stacking: 'normal' as const,
            dataLabels: {
              enabled: true,
              style: {
                fontSize: '10px',
                fontWeight: 'bold',
                color: '#fff',
                textOutline: '1px contrast'
              },
              formatter: function () {
                const value = this.y as number;
                return value > 0 ? value.toLocaleString() : '';
              }
            },
            borderWidth: 0,
            groupPadding: 0.1,
            pointPadding: 0.1,
            states: {
              hover: {
                brightness: 0.1
              }
            },
            animation: {
              duration: 1200
            }
          }
        },
        series: [
          {
            name: 'Scope 1',
            data: scope1Data,
            type: 'column',
            color: '#FF6B6B',
            borderRadius: 3
          },
          {
            name: 'Scope 2',
            data: scope2Data,
            type: 'column',
            color: '#4ECDC4',
            borderRadius: 3
          }
        ],
        credits: {
          enabled: false
        },
        responsive: {
          rules: [{
            condition: {
              maxWidth: 600
            },
            chartOptions: {
              chart: {
                height: 400
              },
              plotOptions: {
                column: {
                  dataLabels: {
                    enabled: false
                  }
                }
              }
            }
          }]
        }
      };

      chartInstance.current = Highcharts.chart(chartRef.current, chartConfig);
    }
  }, [annualData, totalEmissions, selectedLegend]);
  // 🆕 Convert activities array to Select options with "All" as default
  const activityOptions = [
    { label: "All Activities", value: "" },
    ...availableActivities.map(activity => ({
      label: activity,
      value: activity
    }))
  ];
  return (
    <WidgetWrapper>

      <TitleBar title="">
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-start" }}>
        <FilterPanel
          onClear={() => {
            setYearFilter(null);
            setActivityName("");
          }}
        >
          <FormField>
            <Label>Filter by Year</Label>
            <Input
              type="number"
              value={yearFilter || ""}
              onChange={(val) => setYearFilter(val ? parseInt(val) : null)}
              placeholder="Enter year"
            />
          </FormField>


                      <FormField>
                        <Label>Filter by Activity</Label>
                        <Select
                          options={activityOptions}
                          selected={activityName}
                          onChange={(val) => setActivityName(val)}
                          placeholder="Select activity"
                        />
                      </FormField>
        </FilterPanel>
        <Button
                        icon='fas cloud-download-alt'
                        title='Export'
                        onClick={exportToCSV}
                    />
        </div>
      </TitleBar>

      {/* Custom Interactive Legend */}
      {annualData.length > 0 && (
        <div className="annual-carbon-chart__legend">
          <div
            className={`annual-carbon-chart__legend-item ${selectedLegend === "all" ? 'annual-carbon-chart__legend-item--active scope-all' : ''}`}
            onClick={() => {
              setSelectedLegend("all");
              showAllSeries();
            }}
          >
            <span className="annual-carbon-chart__legend-dot annual-carbon-chart__legend-dot--all"></span>
            All
          </div>

          <div
            className={`annual-carbon-chart__legend-item ${selectedLegend === "Scope 1" ? 'annual-carbon-chart__legend-item--active scope-1' : ''}`}
            onClick={() => {
              setSelectedLegend("Scope 1");
              showOnlySeries("Scope 1");
            }}
          >
            <span className="annual-carbon-chart__legend-dot annual-carbon-chart__legend-dot--scope-1"></span>
            Scope 1
          </div>

          <div
            className={`annual-carbon-chart__legend-item ${selectedLegend === "Scope 2" ? 'annual-carbon-chart__legend-item--active scope-2' : ''}`}
            onClick={() => {
              setSelectedLegend("Scope 2");
              showOnlySeries("Scope 2");
            }}
          >
            <span className="annual-carbon-chart__legend-dot annual-carbon-chart__legend-dot--scope-2"></span>
            Scope 2
          </div>
        </div>
      )}


      <div className="annual-carbon-chart">
        {/* Loading State */}
        {loading && (
          <div className="annual-carbon-chart__state">
            <div className="annual-carbon-chart__state-icon">📊</div>
            Loading annual emissions data...
          </div>
        )}

        {/* No Data State */}
        {!loading && annualData.length === 0 && (
          <div className="annual-carbon-chart__state">
            <div className="annual-carbon-chart__state-icon">📈</div>
            No annual emission data found for the selected filters.
            <div className="annual-carbon-chart__state-subtitle">
              Try adjusting your filter criteria or check if data exists for the selected period.
            </div>
          </div>
        )}

        {/* Annual Stacked Bar Chart */}
        {!loading && annualData.length > 0 && (
          <div
            ref={chartRef}
            className="annual-carbon-chart__chart"
          />
        )}
      </div>
    </WidgetWrapper>
  );
};

export default AnnualCarbonEmissionChart;