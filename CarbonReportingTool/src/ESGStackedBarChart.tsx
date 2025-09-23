import React, { useEffect, useRef, useState } from "react";
import Highcharts from 'highcharts';
import { WidgetWrapper, TitleBar, FilterPanel, FormField, Select, Input, Label, useToast, Button } from "uxp/components";
import { IContextProvider } from "./uxp";

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

// Month sort helper
const monthOrder: { [key: string]: number } = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

const ESGStackedBarChart: React.FunctionComponent<IWidgetProps> = (props) => {
  const chartRef = useRef(null);
  const toast = useToast();
  const chartInstance = useRef<Highcharts.Chart | null>(null);
  const [selectedLegend, setSelectedLegend] = useState<string | null>("all");
  const [activityNames, setActivityNames] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [monthFilter, setMonthFilter] = useState<any>(null);
  const [yearFilter, setYearFilter] = useState<any>(new Date().getFullYear());
  const [activityName, setActivityName] = useState<string>("");
  const [availableActivities, setAvailableActivities] = useState<string[]>([]); // 🆕 for dropdown options
  const monthOptions = [
    { label: "Jan", value: "Jan" }, { label: "Feb", value: "Feb" },
    { label: "Mar", value: "Mar" }, { label: "Apr", value: "Apr" },
    { label: "May", value: "May" }, { label: "Jun", value: "Jun" },
    { label: "Jul", value: "Jul" }, { label: "Aug", value: "Aug" },
    { label: "Sep", value: "Sep" }, { label: "Oct", value: "Oct" },
    { label: "Nov", value: "Nov" }, { label: "Dec", value: "Dec" },
  ];

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
        { year: yearFilter, month: monthFilter, activityName: activityName },
        { json: true }
      );

      console.log("Fetched emission data:", result);
      
      const cleanedData = result?.map((row: any) => ({
        activity: row.activity,
        year: row.year,
        month: row.month,
        value: parseFloat(row.value)
      })) || [];

      setActivityData(cleanedData);

      setActivityNames(
        Array.from(new Set(
          cleanedData.map((item: any) => item.activity as string)
        ))
      );
    } catch (error: any) {
      console.error("Error loading emission data:", error);
      toast.error("Failed to load activity data.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate emissions dynamically from API data
  const calculateEmissions = () => {
    if (activityData.length === 0) {
      return { 
        dynamicEmissionData: [], 
        scope1Total: 0, 
        scope2Total: 0, 
        totalEmissions: 0,
        monthlyEmissions: {}
      };
    }

    // Group by month and activity for stacked chart
    const monthlyEmissions: { [key: string]: { [key: string]: number } } = {};
    
    activityData.forEach(item => {
      if (!monthlyEmissions[item.month]) {
        monthlyEmissions[item.month] = {};
      }
      if (!monthlyEmissions[item.month][item.activity]) {
        monthlyEmissions[item.month][item.activity] = 0;
      }
      // Apply emission factors immediately
      const emissionFactor = emissionFactors[item.activity] || 0;
      monthlyEmissions[item.month][item.activity] += item.value * emissionFactor;
    });

    const emissionsByActivity: { [key: string]: number } = {};
    
    // Calculate total emissions by activity
    activityData.forEach(item => {
      if (!emissionsByActivity[item.activity]) {
        emissionsByActivity[item.activity] = 0;
      }
      const emissionFactor = emissionFactors[item.activity] || 0;
      emissionsByActivity[item.activity] += item.value * emissionFactor;
    });

    const dynamicEmissionData = Object.keys(emissionsByActivity).map(activity => {
      const calculatedCO2e = emissionsByActivity[activity];
      const isScope1 = activity.includes("Generator") || activity.includes("Refrigerant");
      
      return {
        source: activity,
        totalCO2e: calculatedCO2e,
        scope: isScope1 ? 1 : 2,
        category: isScope1 ? "Scope 1" : "Scope 2"
      };
    });

    const scope1Total = dynamicEmissionData
      .filter(item => item.scope === 1)
      .reduce((sum, item) => sum + item.totalCO2e, 0);

    const scope2Total = dynamicEmissionData
      .filter(item => item.scope === 2)
      .reduce((sum, item) => sum + item.totalCO2e, 0);

    const totalEmissions = scope1Total + scope2Total;

    return { dynamicEmissionData, scope1Total, scope2Total, totalEmissions, monthlyEmissions };
  };

  const legendItemStyle = (active: boolean, color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: 4,
    backgroundColor: active ? '#f0f8ff' : 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 'bold' : 'normal',
    border: active ? `1px solid ${color}` : '1px solid transparent',
    transition: 'all 0.2s ease'
  });
  
  const legendDotStyle = (color: string): React.CSSProperties => ({
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block'
  });

  const showAllSeries = () => {
    chartInstance.current?.series.forEach(s => s.show());
  };
  
  const showOnlySeries = (name: string) => {
    chartInstance.current?.series.forEach(s => {
      if (s.name === name) s.show();
      else s.hide();
    });
  };
  const exportToCSV = () => {
    if (!activityData.length) {
      toast.error("No data to export");
      return;
    }
  
    const months = Object.keys(monthlyEmissions).sort((a, b) => monthOrder[a] - monthOrder[b]);
    const activities = Array.from(new Set(
      Object.values(monthlyEmissions).flatMap(monthData => Object.keys(monthData))
    ));
  
    const headers = ["Month", ...activities];
    const rows = months.map(month => {
      return [month, ...activities.map(act => (monthlyEmissions[month]?.[act] || 0).toFixed(2))];
    });
  
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");
  
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "stacked_bar_chart_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const { dynamicEmissionData, scope1Total, scope2Total, totalEmissions, monthlyEmissions } = calculateEmissions();

  useEffect(() => {
    fetchActivityData();
  }, [monthFilter, yearFilter, activityName]);

  useEffect(() => {
    if (chartRef.current && Object.keys(monthlyEmissions).length > 0) {
      
      // Get sorted months
      const months = Object.keys(monthlyEmissions).sort((a, b) => monthOrder[a] - monthOrder[b]);
  
      // Monthly total (Scope1 + Scope2) across all activities
      const totalSeriesData = months.map(month => {
        const monthData = monthlyEmissions[month] || {};
        const sum = Object.values(monthData).reduce((acc, val) => acc + val, 0);
        return sum;
      });
      // Get all activities
      const activities = Array.from(new Set(
        Object.values(monthlyEmissions).flatMap(monthData => Object.keys(monthData))
      ));

      // Filter based on selectedLegend
      const filteredActivities = selectedLegend === "all"
        ? activities
        : activities.filter((a) => a === selectedLegend);

      // Create series for each filtered activity
      const series: Highcharts.SeriesColumnOptions[] = filteredActivities.map((activity, index) => {
        const isScope1 = activity.includes("Generator") || activity.includes("Refrigerant");
        const data = months.map(month => monthlyEmissions[month]?.[activity] || 0);
        
        return {
          name: activity,
          data: data,
          type: 'column',
          stack: isScope1 ? 'Scope 1' : 'Scope 2',
          color: isScope1 
            ? (index === 0 ? '#FF6B6B' : '#E74C3C') 
            : '#4ECDC4',
          borderWidth: 0,
          borderRadius: 2
        };
      });
      
      series.push({
        name: "Total (Scope 1 + Scope 2)",
        data: totalSeriesData,
        type: "column",
        stack: "Total",   // separate stack → grouped beside scope bars
        color: "#2ecc71",
        borderWidth: 0,
        borderRadius: 2
      });


      // Highcharts configuration for stacked bar chart
      const chartConfig: Highcharts.Options = {
        chart: {
          type: 'column',
          height: 450,
          backgroundColor: 'transparent',
          spacing: [20, 20, 20, 20]
        },
        title: {
          text: 'Carbon Emissions (Stacked)',
          style: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#2c3e50'
          }
        },

        xAxis: {
          categories: months,
          title: {
            text: 'Month',
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
            }
          },
          gridLineWidth: 1,
          gridLineColor: '#e6e6e6',
          stackLabels: {
            enabled: true,
            style: {
              fontWeight: 'bold',
              color: '#2c3e50',
              fontSize: '10px'
            },
            formatter: function() {
              return this.total?.toFixed(1) + ' kgCO₂e';
            }
          }
        },
        tooltip: {
          headerFormat: '<b>{point.key}</b><br/>',
          pointFormatter: function() {
            if (this.series.name.includes("Total")) {
              return `<span style="color:${this.color}">${this.series.name}</span>: <b>${this.y?.toFixed(1)} kgCO₂e</b><br/>`;
            }
            return `<span style="color:${this.color}">${this.series.name}</span>: <b>${this.y?.toFixed(1)} kgCO₂e</b> (${this.series.options.stack})<br/>`;
          },
          footerFormat: 'Total: <b>{point.total:.1f} kgCO₂e</b>',
          shared: false,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderColor: '#ccc',
          borderRadius: 8,
          shadow: true
        },


        legend: {
          enabled: false // Disable the default legend
        },
        plotOptions: {
          column: {
            stacking: 'normal' as const,
            dataLabels: {
              enabled: false
            },
            borderWidth: 0,
            groupPadding: 0.1,
            pointPadding: 0.05,
            states: {
              hover: {
                brightness: 0.1
              }
            },
            animation: {
              duration: 1000
            }
          }
        },
        series: series,
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
              }
            }
          }]
        }
      };

      chartInstance.current = Highcharts.chart(chartRef.current, chartConfig);
    }
  }, [activityData, monthlyEmissions, totalEmissions, selectedLegend]);
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
            setMonthFilter(null);
            setYearFilter(new Date().getFullYear());
            setActivityName("");
          }}
        >
          <FormField>
            <Label>Filter by Month</Label>
            <Select
              options={monthOptions}
              selected={monthFilter}
              onChange={(newMonth) => setMonthFilter(newMonth)}
            />
          </FormField>

          <FormField>
            <Label>Filter by Year</Label>
            <Input
              type="number"
              value={yearFilter}
              onChange={(val) => setYearFilter(parseInt(val) || null)}
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
      {activityData.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div
            style={legendItemStyle(selectedLegend === "all", "#888")}
            onClick={() => {
              setSelectedLegend("all");
              showAllSeries();
            }}
          >
            <span style={legendDotStyle("#888")}></span>
            All
          </div>

          {activityNames.map(name => {
            const rawColor = chartInstance.current?.series.find(s => s.name === name)?.color;
            const color = typeof rawColor === 'string' ? rawColor : "#ccc";

            return (
              <div
                key={name}
                style={legendItemStyle(selectedLegend === name, color)}
                onClick={() => {
                  setSelectedLegend(name);
                  showOnlySeries(name);
                }}
              >
                <span style={legendDotStyle(color)}></span>
                {name}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ 
        width: '100%', 
        height: '100%', 
        padding: '20px', 
        fontFamily: 'Arial, sans-serif'
      }}>
        {/* Loading State */}
        {loading && (
          <div style={{
            textAlign: 'center' as const,
            padding: '40px',
            color: '#7f8c8d',
            backgroundColor: 'white',
            borderRadius: '12px',
          }}>
            Loading emissions data...
          </div>
        )}

        {/* No Data State */}
        {!loading && activityData.length === 0 && (
          <div style={{
            textAlign: 'center' as const,
            padding: '40px',
            color: '#7f8c8d',
            backgroundColor: 'white',
            borderRadius: '12px',
          }}>
            No emission data found for the selected filters.
          </div>
        )}

        {/* Stacked Bar Chart */}
        {!loading && activityData.length > 0 && (
          <div 
            ref={chartRef} 
            style={{ 
              width: '100%', 
              height: '500px',
              minHeight: '500px',
              backgroundColor: 'white',
              borderRadius: '12px',
            }}
          />
        )}
      </div>
    </WidgetWrapper>
  );
};

export default ESGStackedBarChart;