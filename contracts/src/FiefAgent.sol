// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title FiefAgent
/// @notice Agent ownership, operator registry and the sealed-strategy commitment.
///
/// @dev Deliberately NOT a fork of 0G's `eip-7857-draft` AgentNFT (DECISIONS.md
///      2026-08-25). That fork bought nothing: its verifier hardcodes
///      `isValid = true` on both paths, its `authorizeUsage` has no permissions
///      argument, and its `IERC7857` interface is GPL-3.0. ~150 lines of our own
///      is smaller, safer, and keeps the package uniformly MIT.
///
///      Agentic ID (ERC-7857) is referenced, not inherited: the upstream
///      registries are testnet-only today, and Wave 3 requires a mainnet
///      contract. `agenticIdRef` is advisory metadata linking the two; no
///      security property here depends on it.
contract FiefAgent {
    struct Agent {
        address owner;
        address operator;
        /// @dev keccak256 of the canonical strategy JSON for the CURRENT epoch.
        bytes32 strategyHash;
        /// @dev 0G Storage merkle root of the AES-256-GCM sealed blob.
        bytes32 storageRoot;
        uint64 epochId;
        string domain;
    }

    struct AgenticIdRef {
        uint64 chainId;
        address registry;
        uint256 tokenId;
    }

    mapping(uint256 => Agent) private _agents;
    mapping(uint256 => AgenticIdRef) public agenticIdRef;
    uint256 public nextAgentId = 1;

    event AgentRegistered(
        uint256 indexed agentId, address indexed owner, bytes32 strategyHash, bytes32 storageRoot
    );
    event OperatorChanged(uint256 indexed agentId, address indexed operator);
    event EpochAdvanced(
        uint256 indexed agentId, uint64 indexed epochId, bytes32 strategyHash, bytes32 storageRoot
    );
    event AgentTransferred(uint256 indexed agentId, address indexed from, address indexed to);
    event AgenticIdLinked(
        uint256 indexed agentId, uint64 chainId, address registry, uint256 tokenId
    );

    error NotOwner();
    error UnknownAgent();
    error ZeroAddress();

    modifier onlyOwner(uint256 agentId) {
        if (_agents[agentId].owner == address(0)) revert UnknownAgent();
        if (_agents[agentId].owner != msg.sender) revert NotOwner();
        _;
    }

    function register(bytes32 strategyHash, bytes32 storageRoot, string calldata domain)
        external
        returns (uint256 agentId)
    {
        agentId = nextAgentId++;
        _agents[agentId] = Agent({
            owner: msg.sender,
            operator: msg.sender,
            strategyHash: strategyHash,
            storageRoot: storageRoot,
            epochId: 0,
            domain: domain
        });
        emit AgentRegistered(agentId, msg.sender, strategyHash, storageRoot);
    }

    function setOperator(uint256 agentId, address operator) external onlyOwner(agentId) {
        if (operator == address(0)) revert ZeroAddress();
        _agents[agentId].operator = operator;
        emit OperatorChanged(agentId, operator);
    }

    /// @notice Advance to a new sealed strategy.
    /// @dev Entries never cross epochs (I6) and rental grants do not silently
    ///      follow (I15): a new epoch is a different brain. `RentalDesk` pauses
    ///      grants on advance and requires renter consent to resume.
    function advanceEpoch(uint256 agentId, bytes32 strategyHash, bytes32 storageRoot)
        external
        onlyOwner(agentId)
        returns (uint64 epochId)
    {
        Agent storage a = _agents[agentId];
        epochId = ++a.epochId;
        a.strategyHash = strategyHash;
        a.storageRoot = storageRoot;
        emit EpochAdvanced(agentId, epochId, strategyHash, storageRoot);
    }

    function transferAgent(uint256 agentId, address to) external onlyOwner(agentId) {
        if (to == address(0)) revert ZeroAddress();
        address from = _agents[agentId].owner;
        _agents[agentId].owner = to;
        // The record is keyed by agentId in RecordBook and is untouched here:
        // that is the whole point of the track record travelling with the agent.
        emit AgentTransferred(agentId, from, to);
    }

    function linkAgenticId(uint256 agentId, uint64 chainId, address registry, uint256 tokenId)
        external
        onlyOwner(agentId)
    {
        agenticIdRef[agentId] = AgenticIdRef(chainId, registry, tokenId);
        emit AgenticIdLinked(agentId, chainId, registry, tokenId);
    }

    /* --------------------------------- views -------------------------------- */

    function agentOf(uint256 agentId) external view returns (Agent memory) {
        if (_agents[agentId].owner == address(0)) revert UnknownAgent();
        return _agents[agentId];
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }

    function operatorOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].operator;
    }

    function strategyHashOf(uint256 agentId) external view returns (bytes32) {
        return _agents[agentId].strategyHash;
    }

    function exists(uint256 agentId) external view returns (bool) {
        return _agents[agentId].owner != address(0);
    }
}
