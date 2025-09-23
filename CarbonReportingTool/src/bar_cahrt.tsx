import React, { useEffect, useRef, useState } from "react";
import Highcharts, { SeriesColumnOptions, Chart } from 'highcharts';
import {
  Button,
  FilterPanel, FormField, Input, Label, Select, TitleBar, WidgetWrapper, useToast
} from "uxp/components";
import { IContextProvider } from "./uxp";
import { setYear } from "date-fns";

export interface IWidgetProps {
  uxpContext?: IContextProvider;
  instanceId?: string;
  uiProps?: any;
}
interface ActivityRow {
  activity: string;
  year: string;
  month: string;
  value: number;
}
const monthOrder: { [key: string]: number } = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

const BarChartComponent: React.FunctionComponent<IWidgetProps> = (props) => {
  const chartRef = useRef(null);
  const chartInstance = useRef<Chart | null>(null); // 🔧 chart instance ref
  const toast = useToast();

  const [activityData, setActivityData] = useState([]);
  
  // Updated filter states to match carbon emissions component with current year defaults
  const [fromMonth, setFromMonth] = useState<any>("Jan");
  const [toMonth, setToMonth] = useState<any>("Dec");
  const [fromYear, setFromYear] = useState<any>(new Date().getFullYear());
  const [toYear, setToYear] = useState<any>(new Date().getFullYear());
  const [activityName, setActivityName] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<any>(null); 
  const [yearFilter, setYearFilter] = useState<any>(new Date().getFullYear());
  const [activityNames, setActivityNames] = useState<string[]>([]); // 🔧 for custom legend
  const [availableActivities, setAvailableActivities] = useState<string[]>([]); // 🆕 for dropdown options

  const monthOptions = [
    { label: "January", value: "Jan" }, { label: "February", value: "Feb" },
    { label: "March", value: "Mar" }, { label: "April", value: "Apr" },
    { label: "May", value: "May" }, { label: "June", value: "Jun" },
    { label: "July", value: "Jul" }, { label: "August", value: "Aug" },
    { label: "September", value: "Sep" }, { label: "October", value: "Oct" },
    { label: "November", value: "Nov" }, { label: "December", value: "Dec" },
  ];
  
  const [selectedLegend, setSelectedLegend] = useState<string | null>("all");

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
    try {
      const params: any = {
        fromYear: fromYear,
        toYear: toYear,
        fromMonth: fromMonth,
        toMonth: toMonth,
        activityName: activityName
      };

      const result = await props.uxpContext?.executeAction(
        "carbon_reporting_80rr",
        "GetAllData",
       { year: yearFilter, month: monthFilter, activityName: activityName },
        { json: true }
      );
      // 👀 Debug log raw backend response
      console.log("Backend raw result:", result);
      console.log("Params sent:", params);
      const cleanedData = result?.map((row: any) => ({
        activity: row.activity,
        year: row.year,
        month: row.month,
        value: parseFloat(row.value)
      })) || [];

      setActivityData(cleanedData);

      // 🔧 collect distinct activity names for legend
      setActivityNames(
        Array.from(new Set(
          cleanedData.map((item: any) => item.activity as string)
        ))
      );
      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    }
  };

  const exportToCSV = () => {
    if (!activityData.length) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Activity", "Year", "Month", "Value"];
    const rows = activityData.map(row => [
      row.activity,
      row.year,
      row.month,
      row.value
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "activity_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  // 🆕 Load activities on component mount
  useEffect(() => {
    fetchAvailableActivities();
  }, []);

  // Updated useEffect to use new filter states
  useEffect(() => {
    fetchActivityData();
  }, [monthFilter,yearFilter, activityName]);

  useEffect(() => {
    if (!chartRef.current) return;

    const processedData: { [key: string]: number[] } = {};

    activityData.forEach(item => {
      if (!processedData[item.activity]) {
        processedData[item.activity] = [];
      }
    });

    Object.keys(processedData).forEach(activity => {
      const activityItems = activityData
        .filter(item => item.activity === activity)
        .sort((a, b) => monthOrder[a.month] - monthOrder[b.month]);

      processedData[activity] = activityItems.map(item => item.value);
    });

    const categories = activityData.length > 0
      ? Array.from(new Set(activityData.map(d => d.month))).sort((a, b) => monthOrder[a] - monthOrder[b])
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const series: SeriesColumnOptions[] =
      Object.keys(processedData).length > 0
        ? Object.keys(processedData).map((activity, index) => ({
            name: activity,
            data: processedData[activity],
            type: 'column',
            yAxis: activity === 'Electricity Consumption – HVAC' ? 1 : 0,
            color: index === 0 ? '#7cb5ec' : index === 1 ? '#434348' : '#90ed7d',
            borderWidth: 0,
            borderRadius: 2
          }))
        : [{
            name: 'No Data',
            data: [],
            type: 'column'
          }];

    const chartConfig: Highcharts.Options = {
      chart: {
        type: 'column',
        height: 450,
        backgroundColor: 'transparent',
        spacing: [20, 20, 20, 20]
      },
      title: {
        text: `Activity Data (Bar Chart)(${yearFilter})`,
        style: {
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#333'
        }
      },

      xAxis: {
        categories: categories,
        title: {
          text: 'Month',
          style: {
            fontSize: '14px',
            fontWeight: 'bold'
          }
        },
        gridLineWidth: 0,
        lineWidth: 1,
        lineColor: '#ccc',
        tickWidth: 1,
        tickColor: '#ccc'
      },
      yAxis: [{
        title: {
          text: 'Generator Fuel & Refrigerant (Units)',
          style: { color: '#666', fontSize: '12px', fontWeight: 'bold' }
        },
        labels: { style: { color: '#666', fontSize: '11px' } },
        gridLineWidth: 1,
        gridLineColor: '#e6e6e6'
      }, {
        title: {
          text: 'HVAC Electricity (kWh)',
          style: { color: '#666', fontSize: '12px', fontWeight: 'bold' }
        },
        labels: { style: { color: '#666', fontSize: '11px' } },
        opposite: true,
        gridLineWidth: 0
      }],
      tooltip: {
        shared: true,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ccc',
        borderRadius: 8,
        shadow: true,
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b><br/>',
        style: { fontSize: '12px' }
      },
      legend: { enabled: false }, // 🔧 disable default legend
      plotOptions: {
        column: {
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          borderWidth: 0,
          groupPadding: 0.1,
          pointPadding: 0.05,
          states: { hover: { brightness: 0.1 } },
          animation: { duration: 1000 }
        }
      },
      series: series,
      credits: { enabled: false },
      responsive: {
        rules: [{
          condition: { maxWidth: 600 },
          chartOptions: { chart: { height: 400 } }
        }]
      }
    };

    chartInstance.current = Highcharts.chart(chartRef.current, chartConfig); // 🔧 save chart instance
  }, [activityData]);

  // 🔧 Legend toggle helpers
  const showAllSeries = () => {
    chartInstance.current?.series.forEach(s => s.show());
  };

  const showOnlySeries = (name: string) => {
    chartInstance.current?.series.forEach(s => {
      if (s.name === name) s.show();
      else s.hide();
    });
  };

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
          <FilterPanel onClear={() => {
            // setFromMonth("Jan");
            // setToMonth("Dec");
            // setFromYear(new Date().getFullYear());
            // setToYear(new Date().getFullYear());
            setMonthFilter(null)
            setYearFilter(new Date().getFullYear())
            setActivityName("");
          }}>
            {/* Date Range Filters - Same as carbon emissions component */}
            <FormField> 
              <Label>Filter by Month</Label> 
              <Select options={monthOptions} selected={monthFilter} onChange={(newMonth) => setMonthFilter(newMonth)} /> 
            </FormField> 
            <FormField> 
              <Label>Filter by Year</Label> 
              <Input type="number" value={yearFilter} onChange={(val) => setYearFilter(parseInt(val) || null)} /> 
            </FormField>
            {/* 🆕 Replaced Input with Select for activities */}
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

      {/* 🔧 Custom Legend */}
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

        {activityNames.map((name, idx) => {
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

      <div style={{ width: '100%', height: '100%', padding: '20px' }}>
        <div
          ref={chartRef}
          style={{
            width: '100%',
            height: '450px',
            minHeight: '450px',
            borderRadius: '8px',
          }}
        />
      </div>
    </WidgetWrapper>
  );
};

export default BarChartComponent;