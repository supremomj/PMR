Attribute VB_Name = "ShopeeMonitor"
'==========================================================
' SHOPEE PS5 PRICE MONITOR
' Product: PlayStation 5 Slim (E-Chassis) Solo Pack
' Shop ID: 1638377258  |  Item ID: 43526966216
'==========================================================

Option Explicit

Const SHOPEE_COOKIES As String = "" ' <-- PASTE YOUR COOKIES HERE (see Setup tab)
Const SHOP_ID As String = "1638377258"
Const ITEM_ID As String = "43526966216"
Const PRODUCT_URL As String = "https://shopee.ph/Playstation%C2%AE-5-Slim-(E-Chasis)-Solo-pack-i.1638377258.43526966216"

Dim refreshTimer As Date
Dim isMonitoring As Boolean

'----------------------------------------------------------
' MAIN: Fetch price once
'----------------------------------------------------------
Sub FetchPrice()
    Dim http As Object
    Dim json As String
    Dim price As Double
    Dim priceMin As Double
    Dim priceMax As Double
    Dim itemName As String
    Dim stock As Long
    Dim ws As Worksheet
    Dim wsLog As Worksheet
    
    Set ws = ThisWorkbook.Sheets("Monitor")
    Set wsLog = ThisWorkbook.Sheets("Price Log")
    
    ' Show fetching status
    ws.Range("C5").Value = "Fetching..."
    ws.Range("C5").Font.Color = RGB(255, 165, 0)
    Application.ScreenUpdating = True
    DoEvents
    
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    
    On Error GoTo FetchError
    
    Dim url As String
    url = "https://shopee.ph/api/v4/item/get?itemid=" & ITEM_ID & "&shopid=" & SHOP_ID
    
    http.Open "GET", url, False
    http.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    http.setRequestHeader "Accept", "application/json, text/plain, */*"
    http.setRequestHeader "Accept-Language", "en-US,en;q=0.9"
    http.setRequestHeader "Referer", "https://shopee.ph/"
    http.setRequestHeader "x-api-source", "pc"
    http.setRequestHeader "x-shopee-language", "en"
    
    ' Add cookies if provided
    If Len(Trim(ws.Range("C14").Value)) > 0 Then
        http.setRequestHeader "Cookie", Trim(ws.Range("C14").Value)
    End If
    
    http.Send
    
    If http.Status = 200 Then
        json = http.responseText
        
        ' Check for error in response
        If InStr(json, """error"":0") > 0 Or InStr(json, """error"": 0") > 0 Then
            ' Parse values
            price = ParseJsonNumber(json, "price") / 100000
            priceMin = ParseJsonNumber(json, "price_min") / 100000
            priceMax = ParseJsonNumber(json, "price_max") / 100000
            stock = CLng(ParseJsonNumber(json, "stock"))
            itemName = ParseJsonString(json, "name")
            
            ' Update Monitor sheet
            If Len(itemName) > 0 Then ws.Range("C3").Value = itemName
            ws.Range("C5").Value = Format(price, "#,##0.00")
            ws.Range("C5").Font.Color = RGB(0, 128, 0)
            ws.Range("C6").Value = Format(priceMin, "#,##0.00")
            ws.Range("C7").Value = Format(priceMax, "#,##0.00")
            ws.Range("C8").Value = stock
            ws.Range("C9").Value = Now()
            ws.Range("C10").Value = "✅ Connected"
            ws.Range("C10").Font.Color = RGB(0, 128, 0)
            
            ' Log to Price Log sheet
            Dim nextRow As Long
            nextRow = wsLog.Cells(wsLog.Rows.Count, "A").End(xlUp).Row + 1
            wsLog.Cells(nextRow, 1).Value = Now()
            wsLog.Cells(nextRow, 1).NumberFormat = "yyyy-mm-dd hh:mm:ss"
            wsLog.Cells(nextRow, 2).Value = price
            wsLog.Cells(nextRow, 2).NumberFormat = "#,##0.00"
            wsLog.Cells(nextRow, 3).Value = stock
            wsLog.Cells(nextRow, 4).Value = "OK"
            
            ' Check price drop alert
            CheckPriceAlert price, ws
        Else
            ' API returned error (likely needs cookies)
            ws.Range("C5").Value = "Need Cookies"
            ws.Range("C5").Font.Color = RGB(255, 0, 0)
            ws.Range("C10").Value = "⚠️ See Setup tab for cookie instructions"
            ws.Range("C10").Font.Color = RGB(255, 0, 0)
        End If
    ElseIf http.Status = 403 Then
        ws.Range("C5").Value = "Blocked (403)"
        ws.Range("C5").Font.Color = RGB(255, 0, 0)
        ws.Range("C10").Value = "⚠️ Paste your cookies in cell C14 (see Setup tab)"
        ws.Range("C10").Font.Color = RGB(255, 0, 0)
    Else
        ws.Range("C5").Value = "Error " & http.Status
        ws.Range("C5").Font.Color = RGB(255, 0, 0)
    End If
    
    GoTo CleanUp
    
FetchError:
    ws.Range("C5").Value = "Connection Error"
    ws.Range("C5").Font.Color = RGB(255, 0, 0)
    ws.Range("C10").Value = "❌ " & Err.Description
    ws.Range("C10").Font.Color = RGB(255, 0, 0)
    
CleanUp:
    Set http = Nothing
End Sub

'----------------------------------------------------------
' Check price alert threshold
'----------------------------------------------------------
Sub CheckPriceAlert(currentPrice As Double, ws As Worksheet)
    Dim alertPrice As Double
    alertPrice = ws.Range("C12").Value
    
    If alertPrice > 0 And currentPrice <= alertPrice Then
        ' Flash the cell
        ws.Range("C5").Interior.Color = RGB(255, 255, 0)
        
        ' Show popup
        MsgBox "🎉 PRICE ALERT!" & vbCrLf & vbCrLf & _
               "PlayStation 5 Slim price dropped to:" & vbCrLf & _
               "PHP " & Format(currentPrice, "#,##0.00") & vbCrLf & vbCrLf & _
               "Your target was: PHP " & Format(alertPrice, "#,##0.00") & vbCrLf & vbCrLf & _
               "Click OK to open the Shopee listing.", _
               vbInformation, "Shopee Price Alert - PS5 Slim"
        
        ' Open browser
        Shell "cmd /c start " & PRODUCT_URL
    End If
End Sub

'----------------------------------------------------------
' START auto-refresh monitoring
'----------------------------------------------------------
Sub StartMonitoring()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Monitor")
    
    Dim intervalMinutes As Integer
    intervalMinutes = ws.Range("C11").Value
    If intervalMinutes < 1 Then intervalMinutes = 5
    
    isMonitoring = True
    ws.Range("E5").Value = "🟢 MONITORING ON"
    ws.Range("E5").Font.Color = RGB(0, 128, 0)
    
    ' Fetch immediately
    FetchPrice
    
    ' Schedule next run
    refreshTimer = Now + TimeSerial(0, intervalMinutes, 0)
    Application.OnTime refreshTimer, "AutoRefresh"
End Sub

'----------------------------------------------------------
' STOP auto-refresh monitoring
'----------------------------------------------------------
Sub StopMonitoring()
    On Error Resume Next
    Application.OnTime refreshTimer, "AutoRefresh", , False
    On Error GoTo 0
    
    isMonitoring = False
    
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Monitor")
    ws.Range("E5").Value = "🔴 MONITORING OFF"
    ws.Range("E5").Font.Color = RGB(200, 0, 0)
End Sub

'----------------------------------------------------------
' Called automatically by OnTime
'----------------------------------------------------------
Sub AutoRefresh()
    If Not isMonitoring Then Exit Sub
    
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Monitor")
    
    FetchPrice
    
    Dim intervalMinutes As Integer
    intervalMinutes = ws.Range("C11").Value
    If intervalMinutes < 1 Then intervalMinutes = 5
    
    ' Schedule next
    refreshTimer = Now + TimeSerial(0, intervalMinutes, 0)
    Application.OnTime refreshTimer, "AutoRefresh"
End Sub

'----------------------------------------------------------
' Open product in browser
'----------------------------------------------------------
Sub OpenInBrowser()
    Shell "cmd /c start " & PRODUCT_URL
End Sub

'----------------------------------------------------------
' Clear the price log
'----------------------------------------------------------
Sub ClearLog()
    If MsgBox("Clear all price history?", vbYesNo + vbQuestion, "Confirm") = vbYes Then
        Dim wsLog As Worksheet
        Set wsLog = ThisWorkbook.Sheets("Price Log")
        
        Dim lastRow As Long
        lastRow = wsLog.Cells(wsLog.Rows.Count, "A").End(xlUp).Row
        If lastRow > 2 Then
            wsLog.Rows("3:" & lastRow).Delete
        End If
    End If
End Sub

'----------------------------------------------------------
' JSON parsing helpers
'----------------------------------------------------------
Function ParseJsonNumber(json As String, key As String) As Double
    Dim pos As Long
    Dim endPos As Long
    Dim valStr As String
    
    pos = InStr(json, """" & key & """")
    If pos = 0 Then
        ParseJsonNumber = 0
        Exit Function
    End If
    
    pos = InStr(pos, json, ":")
    pos = pos + 1
    
    ' Skip whitespace
    Do While Mid(json, pos, 1) = " "
        pos = pos + 1
    Loop
    
    endPos = pos
    Do While Mid(json, endPos, 1) Like "[0-9.]" Or Mid(json, endPos, 1) = "-"
        endPos = endPos + 1
    Loop
    
    valStr = Mid(json, pos, endPos - pos)
    If IsNumeric(valStr) Then
        ParseJsonNumber = CDbl(valStr)
    Else
        ParseJsonNumber = 0
    End If
End Function

Function ParseJsonString(json As String, key As String) As String
    Dim pos As Long
    Dim endPos As Long
    
    pos = InStr(json, """" & key & """")
    If pos = 0 Then
        ParseJsonString = ""
        Exit Function
    End If
    
    pos = InStr(pos, json, ":")
    pos = InStr(pos, json, """") + 1
    endPos = pos
    
    Do While endPos <= Len(json)
        If Mid(json, endPos, 1) = """" And Mid(json, endPos - 1, 1) <> "\" Then
            Exit Do
        End If
        endPos = endPos + 1
    Loop
    
    ParseJsonString = Mid(json, pos, endPos - pos)
End Function
