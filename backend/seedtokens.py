from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware as poa_middleware
except ImportError:
    from web3.middleware import geth_poa_middleware as poa_middleware
import json, os
from dotenv import load_dotenv

load_dotenv("../.env.local")

w3 = Web3(Web3.HTTPProvider(os.getenv("SEPOLIA_RPC_URL")))
w3.middleware_onion.inject(poa_middleware, layer=0)
deployer = w3.eth.account.from_key("0x" + os.getenv("PRIVATE_KEY"))

# Load ABI (from contracts/abi/ folder)
with open("../contracts/abi/SimToken.json") as f:
    abi = json.load(f)

token_a = w3.eth.contract(
    address=w3.to_checksum_address("0x983A613d5f224459D2919e0d9E9e77C72E032042"),  # Palladium
    abi=abi
)
token_b = w3.eth.contract(
    address=w3.to_checksum_address("0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07"),  # Badassium
    abi=abi
)

def mint(contract, to, amount_tokens):
    amount_wei = amount_tokens * 10**18
    nonce = w3.eth.get_transaction_count(deployer.address, "pending")
    tx = contract.functions.mint(
        w3.to_checksum_address(to), amount_wei
    ).build_transaction({
        "from": deployer.address,
        "nonce": nonce,
        "gas": 100_000,
        "gasPrice": w3.eth.gas_price,
    })
    signed = deployer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"  ✓ Minted {amount_tokens} tokens → {to}  [tx: {tx_hash.hex()[:20]}...]")
    return receipt

# Mint to the LendingPool so it has liquidity to lend out
mint(token_a, "0x21ef825C55Ad215cD1BD438A64B59ec5C2028A3f", 1_000_000)  # LendingPool
mint(token_a, deployer.address, 100_000)   # your own wallet
mint(token_b, deployer.address, 100_000)