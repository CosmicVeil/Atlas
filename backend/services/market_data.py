#from app.config.Config import API_DATA_KEY 
import csv, os, requests
import time

listOfNames = []

# Get the list of S&P 500 stocks displayed in our websites

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
#API_KEY = os.environ.get('ALPHA_VANTAGE_KEY')
API_KEY = "demo"
BASE_URL = 'https://www.alphavantage.co/query'


def getNamesOfStocks():

    file_path = os.path.join(DATA_DIR, 'constituents.csv')

    with open(file_path, newline='') as csvfile:
        reader = csv.reader(csvfile)

        header = next(reader)

        print(reader)
        print("runs")
        for row in reader:
            listOfNames.append(row[0])
    return listOfNames



def get_quote(symbol):
    """Current price, change, volume — the live price data"""
    response = requests.get(BASE_URL, params={
        'function': 'GLOBAL_QUOTE',
        'symbol': symbol,
        'apikey': API_KEY
    })
    data = response.json()
    quote = data.get('Global Quote', {})

    if not quote:
        return None

    return {
        'symbol': quote.get('01. symbol'),
        'price': float(quote.get('05. price', 0)),
        'change': float(quote.get('09. change', 0)),
        'change_percent': quote.get('10. change percent', '0%'),
        'volume': int(quote.get('06. volume', 0)),
        'previous_close': float(quote.get('08. previous close', 0)),
    }


def get_company_overview(symbol):
    """Company info, fundamentals, PE ratio, market cap etc"""
    response = requests.get(BASE_URL, params={
        'function': 'OVERVIEW',
        'symbol': symbol,
        'apikey': API_KEY
    })
    data = response.json()

    if not data or 'Symbol' not in data:
        return None

    return {
        'symbol': data.get('Symbol'),
        'name': data.get('Name'),
        'description': data.get('Description'),
        'sector': data.get('Sector'),
        'industry': data.get('Industry'),
        'market_cap': data.get('MarketCapitalization'),
        'pe_ratio': data.get('PERatio'),
        'week_52_high': data.get('52WeekHigh'),
        'week_52_low': data.get('52WeekLow'),
        'dividend_yield': data.get('DividendYield'),
        'eps': data.get('EPS'),
    }


def get_full_stock_info(symbol):
    """Combines both"""
    quote = get_quote(symbol)
    time.sleep(1)
    overview = get_company_overview(symbol)

    if not quote or not overview:

        if not quote:
            print("quote breaks")
        if not overview:
            print("overview breaks")
            
        return None

    return overview |quote  # merges both dicts into one



def write_market_data():
    listOfStocks = getNamesOfStocks()

    listOfDicts = []

    for stock in listOfStocks:
        curr_dict = get_full_stock_info(symbol)
        listOfDicts.append(curr_dict)

    with open("data/stock_info.csv", mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
    
        writer.writeheader()  # Writes the header row
        writer.writerows(data)  # Writes data rows

def read_market_data():

    listOfDicts = []

    with open('data/stock_info.csv', mode='r', newline='', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            listOfDicts.append(row)  # Access values by column header
    
    return listOfDicts

#TODO: go past the API limit of 5 calls a day for one day to get all the pertinent information


