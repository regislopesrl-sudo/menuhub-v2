// =========================================================
// Tabular Editor - Advanced Scripting
// Importa/atualiza medidas DAX a partir do arquivo:
// docs/bi-executivo/medidas_executivas_operacionais.dax
//
// Como usar:
// 1) Abra o modelo no Tabular Editor (externo ao Power BI).
// 2) Advanced Scripting -> cole/rode este script.
// 3) Ajuste "daxFilePath" se necessario.
// =========================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

var daxFilePath = @"C:\SistemaDelivery\menuhub-delivery-main\menuhub-delivery-main\docs\bi-executivo\medidas_executivas_operacionais.dax";

if (!File.Exists(daxFilePath))
{
    throw new Exception("Arquivo DAX nao encontrado: " + daxFilePath);
}

var targetTable = Model.Tables.Find("z_Measures") ?? Model.Tables.Find("Fato_Pedidos");
if (targetTable == null)
{
    throw new Exception("Tabela de destino nao encontrada. Crie 'z_Measures' ou garanta 'Fato_Pedidos' no modelo.");
}

var baseMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Orders All","Orders Created","Orders Confirmed","Orders Finalized","Orders Canceled",
    "Gross Revenue Base","Net Revenue Base","Discount Base","Fees Base","Items Qty Base",
    "CMV Theoretical Base","CMV Real Base","Operational Expenses Base","Other Revenue Base",
    "Accounts Receivable Open Base","Accounts Payable Open Base","Receipts Base","Payments Base",
    "Stock Consumption Qty Base","Stock Consumption Cost Base","Losses and Adjustments Base",
    "Order Hour Buckets","Stock Closing Qty by Item"
};

var salesMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Gross Revenue","Net Revenue","Total Discounts","Total Fees","Total Orders","Average Ticket",
    "Average Item Value","Orders by Branch","Orders by Status","Order Conversion %"
};

var cmvMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "CMV Theoretical","CMV Real","CMV Real %","Gross Margin","Gross Margin %",
    "Margin by Product","Margin by Branch","CMV Divergence (Real - Theoretical)","CMV Divergence %"
};

var dreMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Operational Expenses","Other Revenue","Gross Profit","Operating Result",
    "Operating Result %","Managerial Net Profit"
};

var stockMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Stock Consumption","Quantity Consumed","Average Consumed Cost","Stock Opening Qty","Stock Closing Qty",
    "Stock Variation","Stock Opening Value","Stock Closing Value","Average Stock Value","Stock Turnover",
    "Critical Items","Losses and Adjustments"
};

var financialMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Accounts Receivable","Accounts Payable","Financial Balance","Default Amount","Default %",
    "Receipts Period","Payments Period","Receipts Period (Due Date)","Payments Period (Due Date)"
};

var timeMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Net Revenue MTD","Net Revenue QTD","Net Revenue YTD","Operating Result YTD",
    "Net Revenue Previous Month","Net Revenue MoM","Net Revenue MoM %",
    "Net Revenue Previous Year","Net Revenue YoY","Net Revenue YoY %",
    "Accumulated Net Revenue"
};

var operationalMeasures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Orders per Hour","Orders by Channel","Orders by Type","Average Prep Time (min)",
    "Average Delivery Time (min)","Average Time to Delivery (min)",
    "Cancellation Rate %","Finalization Rate %","Operational Productivity","Performance by Branch"
};

string GetFolder(string measureName)
{
    if (baseMeasures.Contains(measureName)) return "01 Base";
    if (salesMeasures.Contains(measureName)) return "02 Vendas";
    if (cmvMeasures.Contains(measureName)) return "03 CMV e Margem";
    if (dreMeasures.Contains(measureName)) return "04 DRE";
    if (stockMeasures.Contains(measureName)) return "05 Estoque";
    if (financialMeasures.Contains(measureName)) return "06 Financeiro";
    if (timeMeasures.Contains(measureName)) return "07 Time Intelligence";
    if (operationalMeasures.Contains(measureName)) return "08 Operacao";
    return "99 Outros";
}

string GetFormatString(string measureName)
{
    if (measureName.Contains("%")) return "0.00%";
    if (measureName.Contains("(min)")) return "0.00";
    if (measureName.Contains("Orders") || measureName.Contains("Items") || measureName.Contains("Qty") || measureName.Contains("Buckets") || measureName.Contains("Critical"))
        return "#,0";
    return "#,0.00";
}

bool IsMeasureHeader(string rawLine)
{
    if (string.IsNullOrWhiteSpace(rawLine)) return false;
    if (char.IsWhiteSpace(rawLine[0])) return false;
    var t = rawLine.Trim();
    if (t.StartsWith("//") || t.StartsWith("--")) return false;
    if (!t.Contains("=")) return false;
    if (t.StartsWith("VAR ", StringComparison.OrdinalIgnoreCase)) return false;
    return true;
}

var parsedMeasures = new List<(string Name, string Expression)>();
string currentName = null;
var expr = new StringBuilder();

foreach (var raw in File.ReadAllLines(daxFilePath))
{
    var line = raw ?? string.Empty;
    var trimmed = line.Trim();

    if (trimmed.StartsWith("//") || trimmed.StartsWith("--"))
    {
        continue;
    }

    if (string.IsNullOrWhiteSpace(trimmed))
    {
        if (!string.IsNullOrWhiteSpace(currentName))
        {
            parsedMeasures.Add((currentName, expr.ToString().TrimEnd()));
            currentName = null;
            expr.Clear();
        }
        continue;
    }

    if (currentName == null)
    {
        if (!IsMeasureHeader(line)) continue;
        var idx = line.IndexOf('=');
        currentName = line.Substring(0, idx).Trim();
        var after = line.Substring(idx + 1).Trim();
        if (!string.IsNullOrWhiteSpace(after))
        {
            expr.AppendLine(after);
        }
    }
    else
    {
        expr.AppendLine(line);
    }
}

if (!string.IsNullOrWhiteSpace(currentName))
{
    parsedMeasures.Add((currentName, expr.ToString().TrimEnd()));
}

if (parsedMeasures.Count == 0)
{
    throw new Exception("Nenhuma medida foi identificada no arquivo DAX.");
}

foreach (var item in parsedMeasures)
{
    var measure = targetTable.Measures.Find(item.Name);
    if (measure == null)
    {
        measure = targetTable.AddMeasure(item.Name, item.Expression);
    }
    else
    {
        measure.Expression = item.Expression;
    }

    measure.DisplayFolder = GetFolder(item.Name);
    measure.FormatString = GetFormatString(item.Name);
    measure.IsHidden = baseMeasures.Contains(item.Name);
}

Info("Medidas importadas/atualizadas: " + parsedMeasures.Count);

