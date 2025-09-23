import React, { useEffect, useRef, useState, useMemo } from "react";
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

const ESGDonutChart: React.FunctionComponent<IWidgetProps> = (props) => {
  const chartRef = useRef(null);
  const toast = useToast();
  
  const [loading, setLoading] = useState(false);
  const [activityData, setActivityData] = useState<any[]>([]);
      const [availableActivities, setAvailableActivities] = useState<string[]>([]); // 🆕 for dropdown options
  // Updated filter states for date ranges
  const [fromMonth, setFromMonth] = useState<any>("Jan");
  const [toMonth, setToMonth] = useState<any>("Dec");
  const [fromYear, setFromYear] = useState<any>(new Date().getFullYear());
  const [toYear, setToYear] = useState<any>(new Date().getFullYear());
  const [activityName, setActivityName] = useState<string>("");

  const monthOptions = [
    { label: "January", value: "Jan" }, { label: "February", value: "Feb" },
    { label: "March", value: "Mar" }, { label: "April", value: "Apr" },
    { label: "May", value: "May" }, { label: "June", value: "Jun" },
    { label: "July", value: "Jul" }, { label: "August", value: "Aug" },
    { label: "September", value: "Sep" }, { label: "October", value: "Oct" },
    { label: "November", value: "Nov" }, { label: "December", value: "Dec" },
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
  const fetchActivityData = async () => {
    if (!props.uxpContext) return;

    setLoading(true);
    try {
      const result = await props.uxpContext.executeAction(
        "carbon_reporting_80rr",
        "GetDataPieChart",
        { 
          fromYear: fromYear,
          toYear: toYear, 
          fromMonth: fromMonth, 
          toMonth: toMonth, 
          activityName: activityName 
        },
        { json: true }
      );

      console.log("Fetched emission data:", result);
      
      const cleanedData = result?.map((row: any) => ({
        activity: row.activity,
        year: row.year,
        month: row.month,
        value: parseFloat(row.value)
      })) || [];

      // Small delay to ensure state update completes
      setTimeout(() => {
        setActivityData(cleanedData);
      }, 10);
      
    } catch (error: any) {
      console.error("Error loading emission data:", error);
      toast.error("Failed to load activity data.");
      setActivityData([]); // Set empty array on error
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
        totalEmissions: 0 
      };
    }

    const emissionsByActivity: { [key: string]: number } = {};
    
    // Group and sum values by activity from real API data
    activityData.forEach(item => {
      if (!emissionsByActivity[item.activity]) {
        emissionsByActivity[item.activity] = 0;
      }
      emissionsByActivity[item.activity] += item.value;
    });

    // Apply emission factors to calculate real CO2e emissions
    const dynamicEmissionData = Object.keys(emissionsByActivity).map(activity => {
      const totalActivityValue = emissionsByActivity[activity];
      const emissionFactor = emissionFactors[activity] || 0;
      const calculatedCO2e = totalActivityValue * emissionFactor;
      
      const isScope1 = activity.includes("Generator") || activity.includes("Refrigerant");
      
      return {
        source: activity,
        totalCO2e: calculatedCO2e,
        scope: isScope1 ? 1 : 2,
        category: isScope1 ? "Scope 1" : "Scope 2"
      };
    });

    // Calculate scope totals from dynamic data
    const scope1Total = dynamicEmissionData
      .filter(item => item.scope === 1)
      .reduce((sum, item) => sum + item.totalCO2e, 0);

    const scope2Total = dynamicEmissionData
      .filter(item => item.scope === 2)
      .reduce((sum, item) => sum + item.totalCO2e, 0);

    const totalEmissions = scope1Total + scope2Total;

    return { dynamicEmissionData, scope1Total, scope2Total, totalEmissions };
  };

  const exportToCSV = () => {
    const { dynamicEmissionData, scope1Total, scope2Total, totalEmissions } = calculateEmissions();

    if (!dynamicEmissionData.length) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Source", "Scope", "Total CO2e (kg)", "Scope 1 Total", "Scope 2 Total", "Total Emissions"];
    const rows = dynamicEmissionData.map(row => [
      row.source,
      row.category,
      row.totalCO2e.toFixed(2),
      "",
      "",
      ""
    ]);

    // Add summary row at the bottom
    rows.push(["", "", "", scope1Total.toFixed(2), scope2Total.toFixed(2), totalEmissions.toFixed(2)]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "carbon_emissions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchActivityData();
  }, [fromMonth, toMonth, fromYear, toYear, activityName, props.uxpContext]);
  useEffect(() => {
  fetchAvailableActivities();
}, []);
  // Move calculateEmissions inside useEffect to ensure it uses fresh data
  useEffect(() => {
    const chart = chartRef.current;
    
    // Calculate emissions fresh with current activityData
    const calculateEmissionsForChart = () => {
      if (activityData.length === 0) {
        return { 
          dynamicEmissionData: [], 
          scope1Total: 0, 
          scope2Total: 0, 
          totalEmissions: 0 
        };
      }

      const emissionsByActivity: { [key: string]: number } = {};
      
      // Group and sum values by activity from real API data
      activityData.forEach(item => {
        if (!emissionsByActivity[item.activity]) {
          emissionsByActivity[item.activity] = 0;
        }
        emissionsByActivity[item.activity] += item.value;
      });

      // Apply emission factors to calculate real CO2e emissions
      const dynamicEmissionData = Object.keys(emissionsByActivity).map(activity => {
        const totalActivityValue = emissionsByActivity[activity];
        const emissionFactor = emissionFactors[activity] || 0;
        const calculatedCO2e = totalActivityValue * emissionFactor;
        
        const isScope1 = activity.includes("Generator") || activity.includes("Refrigerant");
        
        return {
          source: activity,
          totalCO2e: calculatedCO2e,
          scope: isScope1 ? 1 : 2,
          category: isScope1 ? "Scope 1" : "Scope 2"
        };
      });

      // Calculate scope totals from dynamic data
      const scope1Total = dynamicEmissionData
        .filter(item => item.scope === 1)
        .reduce((sum, item) => sum + item.totalCO2e, 0);

      const scope2Total = dynamicEmissionData
        .filter(item => item.scope === 2)
        .reduce((sum, item) => sum + item.totalCO2e, 0);

      const totalEmissions = scope1Total + scope2Total;

      return { dynamicEmissionData, scope1Total, scope2Total, totalEmissions };
    };

    const { dynamicEmissionData, scope1Total, scope2Total, totalEmissions } = calculateEmissionsForChart();
    
    if (chart) {
      // Prepare scope data for outer donut ring
    // A helper function to find the chart instance
    const highchartsChart = Highcharts.charts.find(c => c && c.container.parentNode === chart);

    if (dynamicEmissionData.length === 0) {
      // If there's no data, destroy the existing chart instance
      // and prevent further rendering.
      if (highchartsChart) {
        highchartsChart.destroy();
      }
      return;
    }
      const scopeData = [
        {
          name: 'Scope 1 Emissions',
          y: scope1Total,
          color: '#FF6B6B',
          description: 'Direct emissions from owned sources'
        },
        {
          name: 'Scope 2 Emissions',
          y: scope2Total,
          color: '#4ECDC4',
          description: 'Indirect emissions from purchased energy'
        }
      ].filter(item => item.y > 0); // Only show scopes with actual data

      // Prepare detailed data for inner donut ring with distinct colors
      const detailedData = dynamicEmissionData.map((item, index) => ({
        name: item.source,
        y: item.totalCO2e,
        color: item.scope === 1 
          ? (index === 0 ? '#E74C3C' : '#C0392B') // Different reds for Scope 1 activities
          : '#17A2B8' // Different teal for Scope 2 activities
      }));

      // Highcharts configuration for dynamic ESG donut chart
      const chartConfig: Highcharts.Options = {
        chart: {
          type: 'pie',
          height: 450,
          backgroundColor: 'transparent',
          spacing: [20, 20, 20, 20]
        },
        title: {
          text: `Carbon Emissions by Scope from ${fromYear} to ${toYear}`,
          style: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#2c3e50'
          }
        },

        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderColor: '#bdc3c7',
          borderRadius: 8,
          shadow: true,
          useHTML: true,
          formatter: function() {
            const percentage = ((this.y! / totalEmissions) * 100).toFixed(1);
            return `
              <div style="padding: 8px;">
                <b style="color: ${this.color};">${this.key}</b><br/>
                <strong>${this.y!.toFixed(1)} kgCO₂e</strong><br/>
                <span style="color: #7f8c8d;">${percentage}% of total emissions</span>
              </div>
            `;
          }
        },
        legend: {
          align: 'right' as const,
          verticalAlign: 'middle' as const,
          layout: 'vertical' as const,
          x: -50,
          y: 0,
          itemStyle: {
            fontSize: '13px',
            fontWeight: 'normal',
            color: '#2c3e50'
          },
          itemHoverStyle: {
            color: '#000'
          },
          symbolRadius: 8,
          symbolHeight: 16,
          symbolWidth: 16
        },
        plotOptions: {
          pie: {
            allowPointSelect: true,
            cursor: 'pointer',
            dataLabels: {
              enabled: true,
              distance: 20,
              style: {
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#2c3e50'
              },
              formatter: function() {
                const percentage = ((this.y! / totalEmissions) * 100).toFixed(1);
                return `<b>${this.key}</b><br/>${percentage}%<br/>${this.y!.toFixed(1)} kgCO₂e`;
              }
            },
            showInLegend: true,
            borderWidth: 3,
            borderColor: '#ffffff',
            innerSize: '45%',
            size: '75%',
            center: ['40%', '50%'],
            states: {
              hover: {
                halo: {
                  size: 10,
                  opacity: 0.25
                }
              }
            },
            animation: {
              duration: 1500
            }
          }
        },
        series: [{
          name: 'Carbon Emissions',
          type: 'pie',
          data: scopeData.map(item => ({
            name: item.name,
            y: item.y,
            color: item.color,
            dataLabels: {
              enabled: true
            }
          })),
          size: '80%',
          innerSize: '45%'
        }, {
          name: 'Emission Sources',
          type: 'pie',
          data: detailedData,
          size: '40%',
          innerSize: '20%',
          dataLabels: {
            enabled: true,
            distance: -30,
            style: {
              fontSize: '10px',
              fontWeight: 'bold',
              color: 'white',
              textOutline: '1px black'
            },
            formatter: function() {
              const percentage = ((this.y! / totalEmissions) * 100).toFixed(0);
              return `${percentage}%`;
            }
          },
          showInLegend: false,
          borderWidth: 1,
          borderColor: '#ffffff'
        }] as Highcharts.SeriesPieOptions[],
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
              legend: {
                align: 'center' as const,
                verticalAlign: 'bottom' as const,
                layout: 'horizontal' as const,
                x: 0,
                y: 0
              },
              plotOptions: {
                pie: {
                  center: ['50%', '45%'],
                  size: '85%'
                }
              }
            }
          }]
        }
      };

      // Create the dynamic chart
      Highcharts.chart(chartRef.current, chartConfig);
    }
  }, [activityData]); // Only depend on activityData changes

  // Get calculated emissions using useMemo to prevent unnecessary recalculations
  const { dynamicEmissionData: memoizedEmissionData, scope1Total, scope2Total, totalEmissions } = useMemo(() => {
    return calculateEmissions();
  }, [activityData]);
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
            setFromMonth(null);
            setToMonth(null);
            setFromYear(null);
            setToYear(null);
            setActivityName("");
          }}
        >
          {/* Date Range Filters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "15px" }}>
            <FormField>
              <Label>From Month</Label>
              <Select
                options={monthOptions}
                selected={fromMonth}
                onChange={(newMonth) => setFromMonth(newMonth)}
                placeholder="Select start month"
              />
            </FormField>

            <FormField>
              <Label>To Month</Label>
              <Select
                options={monthOptions}
                selected={toMonth}
                onChange={(newMonth) => setToMonth(newMonth)}
                placeholder="Select end month"
              />
            </FormField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "15px" }}>
            <FormField>
              <Label>From Year</Label>
              <Input
                type="number"
                value={fromYear || ""}
                onChange={(val) => setFromYear(parseInt(val) || null)}
                placeholder="Start year"
              />
            </FormField>

            <FormField>
              <Label>To Year</Label>
              <Input
                type="number"
                value={toYear || ""}
                onChange={(val) => setToYear(parseInt(val) || null)}
                placeholder="End year"
              />
            </FormField>
          </div>

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

      <div style={{ 
        width: '100%', 
        height: '100%', 
        padding: '20px', 
        fontFamily: 'Arial, sans-serif'
      }}>
        {/* Dynamic ESG Summary Cards - AT THE TOP */}
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          marginBottom: '20px',
          flexWrap: 'wrap' as const
        }}>
          <div style={{
            flex: 1,
            minWidth: '200px',
            backgroundColor: '#fff5f5',
            border: '2px solid #FF6B6B',
            borderRadius: '8px',
            padding: '15px',
            textAlign: 'center' as const
          }}>
            <h4 style={{ 
              margin: '0 0 8px 0', 
              color: '#FF6B6B',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Scope 1 Emissions
            </h4>
            <p style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              margin: '0 0 5px 0',
              color: '#2c3e50'
            }}>
              {scope1Total.toFixed(1)} kgCO₂e
            </p>
            <p style={{ 
              fontSize: '12px', 
              color: '#7f8c8d',
              margin: 0
            }}>
              Direct emissions from fuel & refrigerants
            </p>
          </div>

          <div style={{
            flex: 1,
            minWidth: '200px',
            backgroundColor: '#f0fdfc',
            border: '2px solid #4ECDC4',
            borderRadius: '8px',
            padding: '15px',
            textAlign: 'center' as const
          }}>
            <h4 style={{ 
              margin: '0 0 8px 0', 
              color: '#4ECDC4',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Scope 2 Emissions
            </h4>
            <p style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              margin: '0 0 5px 0',
              color: '#2c3e50'
            }}>
              {scope2Total.toFixed(1)} kgCO₂e
            </p>
            <p style={{ 
              fontSize: '12px', 
              color: '#7f8c8d',
              margin: 0
            }}>
             Indirect Emissions from Electricity Consumption
            </p>
          </div>

          <div style={{
            flex: 1,
            minWidth: '200px',
            border: '2px solid #6c757d',
            borderRadius: '8px',
            padding: '15px',
            textAlign: 'center' as const
          }}>
            <h4 style={{ 
              margin: '0 0 8px 0', 
              color: '#6c757d',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Total Emissions
            </h4>
            <p style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              margin: '0 0 5px 0',
              color: '#2c3e50'
            }}>
              {totalEmissions.toFixed(1)} kgCO₂e
            </p>
            <p style={{ 
              fontSize: '12px', 
              color: '#7f8c8d',
              margin: 0
            }}>
              Combined carbon footprint
            </p>
          </div>
        </div>
        </div>
    <div style={{ 
      width: '100%', 
      height: '100%', 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif'
    }}>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: '500px',
          minHeight: '500px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e9ecef'
        }}
      />

        {/* Loading State */}
        {loading && (
          <div style={{
            textAlign: 'center' as const,
            padding: '40px',
            color: '#7f8c8d',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
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
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            No emission data found for the selected filters.
          </div>
        )}

      </div>
    </WidgetWrapper>
  );
};

export default ESGDonutChart;