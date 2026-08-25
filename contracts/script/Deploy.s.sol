// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {FiefAgent} from "../src/FiefAgent.sol";
import {EpochBook} from "../src/EpochBook.sol";
import {RecordBook} from "../src/RecordBook.sol";
import {RentalDesk} from "../src/RentalDesk.sol";
import {IInferenceServing} from "../src/interfaces/IInferenceServing.sol";

/// @notice Deploys the Fief stack.
/// @dev 0G is a standard EVM L1, so no zkSync flags. Serving addresses are the
///      SRC-confirmed constants from PRD v2 §3:
///        mainnet 16661 -> 0x47340d900bdFec2BD393c626E12ea0656F938d84
///        testnet 16602 -> 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E
contract Deploy is Script {
    function run() external {
        address serving = block.chainid == 16661
            ? 0x47340d900bdFec2BD393c626E12ea0656F938d84
            : 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E;

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(pk);

        FiefAgent agents = new FiefAgent();
        EpochBook epochs = new EpochBook(agents);
        RecordBook book = new RecordBook(agents, epochs, IInferenceServing(serving));
        // EpochBook needs RecordBook's address, and RecordBook needs EpochBook's,
        // so the link is a one-shot setter rather than a constructor arg.
        epochs.setRecordBook(address(book));
        RentalDesk desk = new RentalDesk(agents, book, treasury);

        vm.stopBroadcast();

        console.log("chainId    ", block.chainid);
        console.log("deployer   ", deployer);
        console.log("serving    ", serving);
        console.log("FiefAgent  ", address(agents));
        console.log("EpochBook  ", address(epochs));
        console.log("RecordBook ", address(book));
        console.log("RentalDesk ", address(desk));
    }
}
